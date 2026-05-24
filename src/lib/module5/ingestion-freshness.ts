import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

export interface IngestionFreshnessRecord {
  sourceType: string;
  lastIngestionTimestamp: string | null;
  updatedAt: string;
}

export interface IngestionFreshness {
  generatedAt: string;
  records: IngestionFreshnessRecord[];
}

interface IngestionMetadataRow {
  source_type: string;
  last_ingestion_timestamp: string | null;
  updated_at: string;
}

export async function getIngestionFreshness(): Promise<IngestionFreshness> {
  const { data, error } = await supabaseAdmin
    .from("ingestion_metadata")
    .select("source_type,last_ingestion_timestamp,updated_at")
    .order("source_type", { ascending: true });

  if (error) {
    throw new Error(`Failed to load ingestion metadata: ${error.message}`);
  }

  const records = ((data ?? []) as IngestionMetadataRow[]).map((row) => ({
    sourceType: row.source_type,
    lastIngestionTimestamp: row.last_ingestion_timestamp,
    updatedAt: row.updated_at,
  }));

  return {
    generatedAt: new Date().toISOString(),
    records,
  };
}
