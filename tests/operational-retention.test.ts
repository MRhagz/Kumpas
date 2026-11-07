import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role authenticator;
    create schema extensions;
    create table knowledge_chunks(id uuid);
    alter table knowledge_chunks enable row level security;
    create table sessions(id uuid);
    create schema storage; create table storage.objects(name text);
    create function refresh_knowledge_chunks(text,text[],jsonb,jsonb,jsonb) returns integer language sql as $$select 0$$;
    create table silos(silo_id text primary key);
    create function public.test_clock() returns timestamptz language sql as $$select '2026-11-07T00:00:00Z'::timestamptz$$;`);
  for (const file of ["20260523000004_create_ingestion_logs", "20260523000005_create_ingestion_metadata", "20260523000006_create_publication_index_cache", "20261107102120_sw27_safe_operations"]) {
    if (file === "20261107102120_sw27_safe_operations") {
      await db.exec(`insert into ingestion_logs(workflow_name,run_status,started_at,error_message,run_metadata,created_at)
        values ('PRIVATE','failure',now(),'PRIVATE','{"secret":"PRIVATE"}',public.test_clock())`);
    }
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}.sql`, import.meta.url), "utf8").replaceAll("clock_timestamp()", "public.test_clock()"));
  }
  expect(JSON.stringify((await db.query("select * from ingestion_logs")).rows)).not.toContain("PRIVATE");
  await db.exec("delete from ingestion_logs");
}, 30000);
afterAll(async () => { await db.close(); });
it("S06 sanitizes historical/new log content and fixes the retention clock at insertion", async () => {
  const result = await db.query<{ error_message: string; workflow_name: string; run_metadata: object; created_at: Date }>(`insert into ingestion_logs(workflow_name,run_status,started_at,error_message,run_metadata,created_at)
    values ('PRIVATE','failure',now(),'PRIVATE','{"secret":"PRIVATE","total_records":30,"duration_ms":12,"run_id":"PRIVATE"}',now()+interval '100 years') returning *`);
  expect(JSON.stringify(result.rows)).not.toContain("PRIVATE");
  expect(result.rows[0]).toMatchObject({ error_message: "ingestion_failed", workflow_name: "unknown", run_metadata: { total_records: 30, duration_ms: 12 } });
  expect(result.rows[0].created_at.toISOString()).toBe("2026-11-07T00:00:00.000Z");
});
it("S06 prunes exactly at 90 days without losing successful publication/freshness records", async () => {
  const id = (await db.query<{ log_id: string }>(`insert into ingestion_logs(workflow_name,run_status,started_at) values ('ched_cmo_pdf','success',now()) returning log_id`)).rows[0].log_id;
  await db.query("update ingestion_logs set created_at=public.test_clock()-interval '90 days' where log_id=$1", [id]);
  const near = (await db.query<{ log_id: string }>(`insert into ingestion_logs(workflow_name,run_status,started_at) values ('ched_cmo_pdf','success',now()) returning log_id`)).rows[0].log_id;
  await db.query("update ingestion_logs set created_at=public.test_clock()-interval '90 days'+interval '1 millisecond' where log_id=$1", [near]);
  await db.query("insert into ingestion_metadata(source_type,last_ingestion_timestamp,last_success_log_id) values ('ched',now(),$1)", [id]);
  await db.query("insert into publication_index_cache(publication_url,source_type,ingested_at,ingestion_log_id) values ('https://example.test','ched',now(),$1)", [id]);
  await db.exec("set role ingestion_log_maintenance");
  expect((await db.query<{ n: number }>("select prune_ingestion_logs()::integer n")).rows[0].n).toBe(1);
  expect((await db.query<{ n: number }>("select prune_ingestion_logs()::integer n")).rows[0].n).toBe(0);
  await db.exec("reset role");
  expect((await db.query("select * from ingestion_metadata")).rows).toHaveLength(1);
  expect((await db.query<{ ingestion_log_id: string | null }>("select * from publication_index_cache")).rows[0].ingestion_log_id).toBeNull();
  expect((await db.query("select * from ingestion_logs")).rows).toHaveLength(2);
});
it("S11 counselors cannot read operational logs or execute pruning; maintenance cannot read data", async () => {
  for (const role of ["anon", "authenticated", "ingestion_log_maintenance"]) {
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from ingestion_logs")).rejects.toThrow(/permission denied/);
    if (role !== "ingestion_log_maintenance") await expect(db.query("select prune_ingestion_logs()")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
});

it("S11 ingestion worker has no student or storage privileges", async () => {
  await db.exec("set role ingestion_worker");
  await expect(db.query("select * from sessions")).rejects.toThrow(/permission denied/);
  await expect(db.query("select * from storage.objects")).rejects.toThrow(/permission denied/);
  await expect(db.query("delete from ingestion_logs")).rejects.toThrow(/permission denied/);
  await expect(db.query("select prune_ingestion_logs()")).rejects.toThrow(/permission denied/);
  await db.exec("insert into ingestion_logs(workflow_name,run_status,started_at) values ('ched_cmo_pdf','failure',now())");
  await db.exec("reset role");
});
