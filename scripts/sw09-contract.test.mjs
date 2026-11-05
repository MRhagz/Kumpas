import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

// Transpile the production services and mock only the provider/database boundaries.
function services({ response = { embeddings: [{ values: Array(768).fill(0.5) }] }, error } = {}) {
  const calls = { embeddings: [], searches: [] };
  const cache = new Map();
  const external = {
    '@google/genai': { GoogleGenAI: class {
      models = { embedContent: async (request) => {
        calls.embeddings.push(request);
        if (error) throw error;
        return response;
      } };
    } },
    '@/lib/supabase': { supabaseAdmin: { rpc: async (name, request) => {
      calls.searches.push({ name, request });
      return { data: [{ silo_id: request.target_silo_id, official_source_url: 'https://example.org',
        source_type: { market_analytics: 'psa_openstat_lfs', live_labor_demand: 'dole_ble_lmi', path_feasibility: 'ched_cmo' }[request.target_silo_id],
        embedding_model: 'gemini-embedding-001', embedding_dimensions: 768,
        publication_date: null, source_metadata: { title: 'Official report' } }], error: null };
    } } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const compiledModule = { exports: {} };
    cache.set(file, compiledModule.exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, process, setTimeout, clearTimeout, AbortController, Headers, require: (name) => {
      if (external[name]) return external[name];
      if (name.startsWith('@/')) return load(path.resolve(scriptDirectory, '../src', `${name.slice(2)}.ts`));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
      throw new Error(`Unexpected dependency: ${name}`);
    } }, { filename: file });
    return compiledModule.exports;
  }
  const root = path.resolve(scriptDirectory, '../src/lib/module3');
  return { calls,
    embedding: load(path.join(root, 'query-embedding-service.ts')).queryEmbeddingService,
    retrieval: load(path.join(root, 'vector-store-query-service.ts')).vectorStoreQueryService,
  };
}

function withConfig(values, run) {
  const names = ['EMBEDDING_MODEL', 'EMBEDDING_DIMENSIONS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  return Promise.resolve().then(run).finally(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
}

test('I14 query uses the approved model, dimensions and RETRIEVAL_QUERY', () => withConfig({}, async () => {
  const { embedding, calls } = services();
  assert.equal((await embedding.embed('approved career signals', 'test-key')).length, 768);
  assert.equal(calls.embeddings[0].model, 'gemini-embedding-001');
  assert.equal(calls.embeddings[0].config.outputDimensionality, 768);
  assert.equal(calls.embeddings[0].config.taskType, 'RETRIEVAL_QUERY');
  assert.equal(calls.embeddings[0].contents, 'approved career signals');
}));

test('I14 incompatible configuration fails before provider or database calls', async () => {
  for (const config of [{ EMBEDDING_MODEL: 'text-embedding-004' },
    { EMBEDDING_DIMENSIONS: '3072' }, { EMBEDDING_DIMENSIONS: 'invalid' }]) {
    await withConfig(config, async () => {
      const { embedding, retrieval, calls } = services();
      await assert.rejects(embedding.embed('query', 'key'), /Incompatible embedding configuration/);
      await assert.rejects(retrieval.query('AcademicAuditor', Array(768).fill(0.5)), /Incompatible/);
      assert.equal(calls.embeddings.length, 0);
      assert.equal(calls.searches.length, 0);
    });
  }
});

test('malformed, nonfinite and wrong-size provider embeddings fail', () => withConfig({}, async () => {
  for (const values of [undefined, Array(767).fill(1), Array(768).fill(Infinity),
    Array(768).fill(NaN), Array(768).fill('1')]) {
    const { embedding } = services({ response: { embeddings: [{ values }] } });
    await assert.rejects(embedding.embed('query', 'key'), /768 finite embedding values/);
  }
}));

test('provider failure is propagated without returning a usable vector', () => withConfig({}, async () => {
  const { embedding } = services({ error: new Error('provider unavailable') });
  await assert.rejects(embedding.embed('query', 'key'), /provider unavailable/);
}));

test('retrieval sends the embedding fingerprint and preserves unavailable provenance', () => withConfig({}, async () => {
  const { retrieval, calls } = services();
  for (const [agent, silo] of [['AcademicAuditor', 'market_analytics'],
    ['IndustryAnalyst', 'live_labor_demand'], ['FeasibilityStrategist', 'path_feasibility']]) {
    const result = await retrieval.query(agent, Array(768).fill(0.5));
    const call = calls.searches.at(-1);
    assert.equal(call.name, 'match_knowledge_chunks');
    assert.equal(call.request.query_model, 'gemini-embedding-001');
    assert.equal(call.request.query_dimensions, 768);
    assert.equal(call.request.target_silo_id, silo);
    assert.equal(call.request.request_agent, agent);
    assert.equal(JSON.parse(call.request.query_embedding).length, 768);
    assert.equal(result[0].official_source_url, 'https://example.org');
    assert.equal(result[0].publication_date, null);
  }
}));

test('invalid vectors never reach database retrieval', () => withConfig({}, async () => {
  const { retrieval, calls } = services();
  for (const vector of [[], Array(768).fill(NaN), Array(768).fill('1')]) {
    await assert.rejects(retrieval.query('AcademicAuditor', vector), /768 finite embedding values/);
  }
  assert.equal(calls.searches.length, 0);
}));
