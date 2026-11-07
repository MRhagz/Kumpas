import type { ApprovedProfile } from "@/types";

// ─── Silo Routing ──────────────────────────────────────────────────

export type SiloId = "market_analytics" | "live_labor_demand" | "path_feasibility";

export type AgentName = "AcademicAuditor" | "IndustryAnalyst" | "FeasibilityStrategist";

export const AGENT_SILO_MAP: Readonly<Record<AgentName, SiloId>> = Object.freeze({
  AcademicAuditor: "market_analytics",
  IndustryAnalyst: "live_labor_demand",
  FeasibilityStrategist: "path_feasibility",
});

export const AGENT_SOURCE_MAP = Object.freeze({
  AcademicAuditor: Object.freeze(["psa_openstat_lfs"]),
  IndustryAnalyst: Object.freeze(["dole_ble_lmi"]),
  FeasibilityStrategist: Object.freeze(["ched_cmo", "tesda_manual"]),
});

// ─── Retrieved Context ─────────────────────────────────────────────

export interface RetrievedChunk {
  silo_id: string;
  source_url: string;
  chunk_index: number;
  content: string;
  acquisition_method: string;
  source_metadata: Record<string, unknown>;
  ingestion_timestamp: string;
  similarity: number;
  source_type: string;
  official_source_url: string | null;
  publication_date: string | null;
  embedding_model: string;
  embedding_dimensions: number;
}

// ─── Agent Output (produced by each specialist agent) ──────────────

export type AgentStatus = "SUCCESS" | "FAILED" | "UNAVAILABLE";

export interface SpecialistStatus {
  agent: AgentName;
  status: AgentStatus;
  error?: string;
  unavailableEvidence: string[];
}

export interface AgentOutput {
  agentName: AgentName;
  status: AgentStatus;
  analysis: string;
  retrievedChunks: RetrievedChunk[];
  unavailableEvidence?: string[];
  error?: string;
}

// ─── SynthesisInterpreter Types ────────────────────────────────────

export interface CandidateCareerPath {
  careerPath: string;
  aptitudeScore: number | null;
  demandScore: number | null;
  feasibilityScore: number | null;
  componentEvidence: Record<"aptitude" | "demand" | "feasibility", ComponentEvidence | null>;
  signals: string[];
  keySignalDetails: KeySignalDetail[];
  sourceReferences: SourceReference[];
}

export interface ComponentEvidence {
  inputReferences: string[];
  sourceReferences: { reference: string; chunkIndex: number; siloId?: string }[];
  explanation: string;
}

export interface KeySignalDetail {
  label: string;
  value: string;
  subNote?: string;
  polarity: "positive" | "negative" | "neutral";
}

export interface SourceReference {
  title: string;
  reference: string;
  acquisitionMethod: string;
  ingestionTimestamp: string | null;
  publicationDate?: string | null;
  sourceUrl?: string | null;
  chunkIndex?: number;
  siloId?: string;
  relatedSignals: string[];
}

export interface IntermediateSynthesis {
  candidates: CandidateCareerPath[];
}

// ─── AlignmentScoreCalculator Types ────────────────────────────────

export interface ScoredCareerPath extends CandidateCareerPath {
  alignmentScore: number | null;
  rank: number | null;
}

// ─── RankingAgent Types ────────────────────────────────────────────

export interface RankedCareerPath extends ScoredCareerPath {
  reasoningSummary: string;
}

// ─── Dispatcher Input ──────────────────────────────────────────────

export interface AnalysisInput {
  sessionId: string;
  approvedProfile: ApprovedProfile;
}

// Versioned workflow contract for downstream integration; legacy DTOs remain unchanged.
export type { AnalysisRunContract } from "@/lib/module5/versioned-contracts";
