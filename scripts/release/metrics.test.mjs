import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, qualificationCoverage, validateWorkload, draftOutcome } from "./metrics.mjs";

test("keeps failures in error rate and the gate while using nearest-rank successful p95", () => {
  const samples = Array.from({ length: 20 }, (_, n) => ({ outcome: "success", durationMs: (n + 1) * 1000 }));
  samples.push({ outcome: "timeout", durationMs: 300000 });
  const result = summarize(samples, 10000);
  assert.equal(result.attempts, 21);
  assert.equal(result.errorRate, 1 / 21);
  assert.equal(result.throughputPerSecond, 2);
  assert.deepEqual(result.latencyMs, { min: 1000, median: 10500, p95: 19000, max: 20000 });
  assert.equal(result.within300Seconds, false);
  assert.equal(summarize([], 0).within300Seconds, false);
  assert.equal(summarize([{ outcome: "success", durationMs: 300001 }], 300001).within300Seconds, false);
});

test("partial recovery remains visible and does not pass healthy-provider qualification", () => {
  const agentStatuses = ["AcademicAuditor", "IndustryAnalyst", "FeasibilityStrategist"].map(agent => ({ agent, status: "SUCCESS" }));
  assert.equal(draftOutcome({ agentStatuses }, 300000).outcome, "success");
  assert.equal(draftOutcome({ agentStatuses }, 300001).outcome, "timeout");
  agentStatuses[2].status = "FAILED";
  const partial = draftOutcome({ agentStatuses }, 180000);
  assert.equal(partial.outcome, "partial");
  assert.equal(partial.draftReady, true);
  assert.equal(partial.failedSpecialists, 1);
  assert.equal(partial.specialists[2].status, "FAILED");
  const result = summarize([{ ...partial, durationMs: 180000 }], 180000);
  assert.equal(result.partialDrafts, 1);
  assert.equal(result.successful, 0);
  assert.equal(result.errorRate, 1);
  assert.equal(result.within300Seconds, false);
  agentStatuses[2].status = "UNAVAILABLE";
  assert.equal(draftOutcome({ agentStatuses }, 180000).outcome, "success");
  assert.equal(draftOutcome({ agentStatuses }, 180000).unavailableSpecialists, 1);
  assert.equal(draftOutcome({}, 180000).outcome, "identity_mismatch");
  assert.equal(draftOutcome({ agentStatuses: [null, ...agentStatuses.slice(1)] }, 180000).outcome, "identity_mismatch");
  assert.equal(draftOutcome({ agentStatuses: [agentStatuses[0], agentStatuses[0], agentStatuses[2]] }, 180000).outcome, "identity_mismatch");
});

test("qualification coverage requires the whole sequential and distinct-account concurrent workloads", () => {
  const one = (kind, count) => Array.from({ length: count }, () => ({ kind, sessions: [{ profile: "notes" }] }));
  const waves = [...one("warmup", 5), ...one("cold", 3),
    ...["full", "partial", "notes"].flatMap(profile => Array.from({ length: 10 }, () => ({ kind: "sequential", sessions: [{ profile }] }))),
    ...Array.from({ length: 5 }, () => ({ kind: "concurrent", sessions: Array.from({ length: 5 }, (_, n) => ({ account: `c${n}`, storageState: `${n}.json` })) })),
    { kind: "stress", sessions: Array(10).fill({}) }];
  assert.deepEqual(qualificationCoverage(waves), { P01: true, P02: true });
  waves.at(-2).sessions[0].storageState = "1.json";
  assert.equal(qualificationCoverage(waves).P02, false);
  waves.shift();
  assert.equal(qualificationCoverage(waves).P01, false);
});

test("rejects unsafe origins, unidentified builds and reused sessions before browser actions", () => {
  const manifest = { url: "https://staging.example.test", commit: "a".repeat(40), syntheticOnly: true,
    deploymentId: "fixture", hardware: "dual-core, 4GB", network: "fixture", providerQuota: "fixture",
    databaseTier: "fixture", sourceSnapshot: "fixture", providerVerificationRecord: "fixture",
    waves: [{ kind: "sequential", sessions: [{ sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", storageState: "a.json", account: "c1", profile: "notes" }] }] };
  assert.doesNotThrow(() => validateWorkload(manifest));
  assert.throws(() => validateWorkload({ ...manifest, url: "https://user:password@example.test" }));
  assert.throws(() => validateWorkload({ ...manifest, commit: "main" }));
  assert.throws(() => validateWorkload({ ...manifest, waves: [...manifest.waves, ...manifest.waves] }));
});
