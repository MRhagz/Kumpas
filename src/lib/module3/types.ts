import type { ApprovedProfile } from "@/types";

// ─── Silo Routing ──────────────────────────────────────────────────

export type SiloId = "market_analytics" | "live_labor_demand" | "path_feasibility";

export type AgentName = "AcademicAuditor" | "IndustryAnalyst" | "FeasibilityStrategist";

export const AGENT_SILO_MAP: Record<AgentName, SiloId> = {
  AcademicAuditor: "market_analytics",
  IndustryAnalyst: "live_labor_demand",
  FeasibilityStrategist: "path_feasibility",
};

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
}

// ─── Agent Output (produced by each specialist agent) ──────────────

export type AgentStatus = "SUCCESS" | "FAILED";

export interface AgentOutput {
  agentName: AgentName;
  status: AgentStatus;
  analysis: string;
  retrievedChunks: RetrievedChunk[];
  error?: string;
}

// ─── SynthesisInterpreter Types ────────────────────────────────────

export interface CandidateCareerPath {
  careerPath: string;
  aptitudeScore: number;
  demandScore: number;
  feasibilityScore: number;
  signals: string[];
  sourceReferences: SourceReference[];
}

export interface SourceReference {
  title: string;
  reference: string;
  acquisitionMethod: string;
  ingestionTimestamp: string;
  relatedSignals: string[];
}

export interface IntermediateSynthesis {
  candidates: CandidateCareerPath[];
}

// ─── AlignmentScoreCalculator Types ────────────────────────────────

export interface ScoredCareerPath extends CandidateCareerPath {
  alignmentScore: number;
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
