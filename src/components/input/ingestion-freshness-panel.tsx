"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Database, Loader2 } from "lucide-react";

interface IngestionFreshnessRecord {
  sourceType: string;
  lastIngestionTimestamp: string | null;
  updatedAt: string;
}

interface IngestionFreshnessResponse {
  generatedAt: string;
  records: IngestionFreshnessRecord[];
}

const SOURCE_LABELS: Record<string, string> = {
  psa_openstat: "PSA OpenSTAT",
  dole_ble: "DOLE BLE",
  ched_cmo: "CHED CMO",
  tesda_program_costs: "TESDA Program Costs",
  market_analytics: "Market Analytics",
  live_labor_demand: "Live Labor Demand",
  path_feasibility: "Path Feasibility",
};

export default function IngestionFreshnessPanel() {
  const [freshness, setFreshness] = useState<IngestionFreshnessResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadFreshness() {
      try {
        const response = await fetch("/api/ingestion/freshness", {
          cache: "no-store",
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Could not load ingestion freshness.");
        }

        const body = (await response.json()) as IngestionFreshnessResponse;
        if (isMounted) {
          setFreshness(body);
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load ingestion freshness.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadFreshness();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="mb-5 rounded-xl border border-sage/20 bg-sage/[0.04] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sage shadow-sm">
          {isLoading ? (
            <Loader2 size={17} className="animate-spin" />
          ) : error ? (
            <AlertTriangle size={17} className="text-amber" />
          ) : (
            <Database size={17} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-charcoal-3">
              Knowledge Base Freshness
            </h3>
            {freshness && (
              <span className="text-[11px] text-muted-text">
                Checked {formatDateTime(freshness.generatedAt)}
              </span>
            )}
          </div>

          {isLoading && (
            <p className="mt-2 text-[13px] text-muted-text">
              Checking ingestion timestamps...
            </p>
          )}

          {error && (
            <p className="mt-2 text-[13px] leading-relaxed text-amber">
              {error}
            </p>
          )}

          {freshness && freshness.records.length === 0 && (
            <p className="mt-2 text-[13px] text-muted-text">
              No ingestion metadata is available yet.
            </p>
          )}

          {freshness && freshness.records.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {freshness.records.map((record) => (
                <div
                  key={record.sourceType}
                  className="rounded-lg border border-black/[0.06] bg-white/70 px-3 py-2"
                >
                  <p className="truncate text-[12px] font-semibold text-ink">
                    {formatSourceLabel(record.sourceType)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-text">
                    {record.lastIngestionTimestamp
                      ? formatDateTime(record.lastIngestionTimestamp)
                      : "Not ingested yet"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSourceLabel(sourceType: string): string {
  return (
    SOURCE_LABELS[sourceType] ??
    sourceType
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
