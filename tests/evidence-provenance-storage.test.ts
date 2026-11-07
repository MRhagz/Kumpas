import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
const db = new PGlite();
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
beforeAll(async () => {
  await db.exec(`create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.sessions(id uuid primary key, counselor_id uuid);`);
  await db.exec(migration("20260523000002_module3_recommendations"));
  await db.exec(`insert into sessions values ('11111111-1111-4111-8111-111111111111',null);
    insert into ranked_recommendations(id,session_id,rank,career_path,alignment_score,aptitude_fit,market_demand,financial_feasibility,reasoning_summary)
    values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',1,'Synthetic',74.5,80,60,90,'Legacy');
    insert into recommendation_sources(recommendation_id,title,reference,acquisition_method,ingestion_timestamp) values
    ('22222222-2222-4222-8222-222222222222','Source unavailable','source-unavailable','unknown','1970-01-01T00:00:00Z');`);
  await db.exec(migration("20261107071713_sw18_evidence_provenance"));
}, 30000);
afterAll(() => db.close());
it("replaces only the legacy epoch sentinel and stores unknown dates without defaulting to now", async () => {
  expect((await db.query("select ingestion_timestamp from recommendation_sources")).rows).toEqual([{ ingestion_timestamp: null }]);
  await db.exec(`insert into recommendation_sources(recommendation_id,title,reference,acquisition_method,publication_date,source_url,chunk_index,silo_id)
    values ('22222222-2222-4222-8222-222222222222','Public evidence','repository:source','operator_curated_pdf',null,'https://example.gov.ph/source',2,'path_feasibility');`);
  expect((await db.query("select ingestion_timestamp,publication_date,source_url,chunk_index,silo_id from recommendation_sources where chunk_index=2")).rows[0])
    .toEqual({ ingestion_timestamp: null, publication_date: null, source_url: "https://example.gov.ph/source", chunk_index: 2, silo_id: "path_feasibility" });
});
it("preserves actual publication/ingestion dates and existing ownership policies", async () => {
  await db.exec(`update recommendation_sources set ingestion_timestamp='2026-11-01T00:00:00Z',publication_date='2010-01-01' where chunk_index=2`);
  expect((await db.query("select publication_date::text,ingestion_timestamp::text from recommendation_sources where chunk_index=2")).rows[0])
    .toEqual({ publication_date: "2010-01-01", ingestion_timestamp: "2026-11-01 00:00:00+00" });
  expect((await db.query("select policyname from pg_policies where tablename='recommendation_sources'")).rows).toEqual([{ policyname: "recommendation_sources_own_session" }]);
});
