import { stripMarkdownEmphasis } from "@/lib/module3/synthesis-interpreter";
import { supabaseAdmin } from "@/lib/supabase";
import type { RecommendationProvider } from "@/lib/report/provider";
import type {
  AcademicDocumentType,
  AcademicEvidenceSummary,
  KeySignalDetail,
  RankedRecommendation,
  RankedRecommendationList,
  RecommendationSource,
  StudentProfile,
} from "@/lib/report/types";
import type { ApprovedProfile } from "@/types";
import { formatReasoningSummary } from "@/lib/report/reasoning-formatter";
import { sourceDate, publicSourceUrl } from "@/lib/report/evidence-summary";

function safeRecommendation(recommendation: RankedRecommendation): RankedRecommendation {
  const formatted = formatReasoningSummary(recommendation, { maxLength: Number.MAX_SAFE_INTEGER });
  return { ...recommendation, reasoningSummary: formatted.summary,
    keySignals: formatted.claims.length ? formatted.claims.map((claim) => claim.text) : [formatted.summary],
    keySignalDetails: formatted.claims.map((claim) => ({ label: `${claim.dimension[0].toUpperCase()}${claim.dimension.slice(1)} evidence`, value: claim.text, polarity: "neutral" })),
    componentEvidence: Object.fromEntries(Object.entries(recommendation.componentEvidence ?? {}).map(([dimension, evidence]) => [dimension,
      evidence ? { ...evidence, explanation: formatted.claims.find((claim) => claim.dimension === dimension)?.text ?? "Evidence summary unavailable." } : null])) as RankedRecommendation["componentEvidence"],
    sources: recommendation.sources.map((source) => ({ ...source, relatedSignals: formatted.claims.filter((claim) => claim.sourceReferences.some((ref) => ref.reference === source.reference && ref.chunkIndex === source.chunkIndex && ref.siloId === source.siloId)).map((claim) => claim.text), ingestionTimestamp: sourceDate(source.ingestionTimestamp),
      publicationDate: sourceDate(source.publicationDate), sourceUrl: publicSourceUrl(source.sourceUrl) ?? publicSourceUrl(source.reference) })) };
}

export function sanitizeRecommendationList(list: RankedRecommendationList): RankedRecommendationList {
  return { ...list, recommendations: list.recommendations.map(safeRecommendation) };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

function buildStudentProfile(
  sessionId: string,
  profile: ApprovedProfile,
): StudentProfile {
  const interests = stripHtml(profile.counselorNotes.interests)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const strengths: string[] = [];
  if (profile.academicData.form137) {
    const topSubjects = [...profile.academicData.form137.subjects]
      .filter((row): row is typeof row & { grade: number } => typeof row.grade === "number")
      .sort((a, b) => b.grade - a.grade)
      .slice(0, 3)
      .map((s) => s.name);
    strengths.push(...topSubjects);
  }
  if (profile.academicData.ncae) {
    const topStrands = Object.entries(profile.academicData.ncae.strand_scores)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([strand]) => strand);
    strengths.push(...topStrands);
  }
  if (strengths.length === 0) {
    strengths.push(...interests.slice(0, 2));
  }

  const concerns = stripHtml(profile.counselorNotes.concerns)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const financialText = stripHtml(profile.counselorNotes.financial).toLowerCase();
  let financialStatus: StudentProfile["financialStatus"] = "unknown";
  if (financialText.includes("stable") || financialText.includes("sufficient")) {
    financialStatus = "stable";
  } else if (
    financialText.includes("constrained") ||
    financialText.includes("limited") ||
    financialText.includes("difficult") ||
    financialText.includes("low")
  ) {
    financialStatus = "constrained";
  }

  return {
    sessionId,
    targetCareer: stripHtml(profile.counselorNotes.careerGoal) || undefined,
    interests: interests.length > 0 ? interests : ["Not specified"],
    strengths: strengths.length > 0 ? strengths : ["Not specified"],
    financialStatus,
    concerns: concerns.length > 0 ? concerns : [],
    approvedAt: profile.sessionTimestamp,
    withheldNoteValues: [profile.counselorNotes.financial, profile.counselorNotes.concerns, profile.counselorNotes.impression].map(stripHtml),
  };
}

async function getApprovedStudentProfile(sessionId: string): Promise<StudentProfile> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("approved_profile")
    .eq("id", sessionId)
    .single();

  if (error || !data?.approved_profile) {
    throw new Error(`No approved profile found for session ${sessionId}`);
  }

  return buildStudentProfile(sessionId, data.approved_profile as ApprovedProfile);
}

async function getRankedRecommendations(
  sessionId: string,
): Promise<RankedRecommendationList> {
  const { data: recs, error: recErr } = await supabaseAdmin
    .from("ranked_recommendations")
    .select("*")
    .eq("session_id", sessionId)
    .order("rank", { ascending: true, nullsFirst: false })
    .order("career_path", { ascending: true });

  if (recErr) {
    throw new Error(`Failed to fetch recommendations: ${recErr.message}`);
  }
  if (!recs || recs.length === 0) {
    throw new Error(`No recommendations found for session ${sessionId}`);
  }

  if (recs.some((r) => r.score_contract !== "0-100-v1")) throw new Error("Legacy scoring contract: regenerate analysis before producing a report.");

  recs.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.career_path.localeCompare(b.career_path, "en"));
  const recIds = recs.map((r) => r.id);
  const { data: sources, error: srcErr } = await supabaseAdmin
    .from("recommendation_sources")
    .select("*")
    .in("recommendation_id", recIds);

  if (srcErr) {
    throw new Error(`Failed to fetch recommendation sources: ${srcErr.message}`);
  }

  const sourcesByRec = new Map<string, RecommendationSource[]>();
  for (const s of sources ?? []) {
    const list = sourcesByRec.get(s.recommendation_id) ?? [];
    list.push({
      id: s.id,
      title: s.title,
      reference: s.reference,
      acquisitionMethod: s.acquisition_method,
      ingestionTimestamp: s.ingestion_timestamp,
      publicationDate: s.publication_date ?? null,
      sourceUrl: s.source_url ?? null,
      chunkIndex: s.chunk_index ?? undefined,
      siloId: s.silo_id ?? undefined,
      relatedSignals: (s.related_signals as string[]) ?? [],
    });
    sourcesByRec.set(s.recommendation_id, list);
  }

  const recommendations: RankedRecommendation[] = recs.map((r) => ({
    id: r.id,
    rank: r.rank,
    careerPath: r.career_path,
    alignmentScore: r.alignment_score,
    aptitudeFit: r.aptitude_fit,
    marketDemand: r.market_demand,
    financialFeasibility: r.financial_feasibility,
    reasoningSummary: r.reasoning_summary,
    keySignals: (r.key_signals as string[]) ?? [],
    keySignalDetails: normalizeKeySignalDetails(
      r.key_signal_details,
      (r.key_signals as string[]) ?? [],
    ),
    sources: sourcesByRec.get(r.id) ?? [],
    approvedProfileVersion: r.approved_profile_version,
    componentEvidence: r.component_evidence,
    weights: r.score_weights,
    status: r.status,
    degradedReason: r.degraded_reason ?? undefined,
    incompleteReason: r.incomplete_reason ?? undefined,
}));

  return {
    sessionId,
    generatedAt: recs[0]?.created_at ?? new Date().toISOString(),
    scoreContract: "0-100-v1",
    recommendations: recommendations.map(safeRecommendation),
  };
}

const DOC_TYPE_MAP: Record<string, AcademicDocumentType> = {
  form_137: "form137",
  ncae: "ncae",
  nat: "nat",
};

const ALL_ACADEMIC_TYPES: AcademicDocumentType[] = ["form137", "ncae", "nat"];

async function getAcademicEvidenceSummary(
  sessionId: string,
): Promise<AcademicEvidenceSummary> {
  const { data, error } = await supabaseAdmin
    .from("extraction_results")
    .select("document_type")
    .eq("session_id", sessionId);

  if (error) {
    throw new Error(`Failed to fetch extraction results: ${error.message}`);
  }

  const availableDocuments = [
    ...new Set(
      (data ?? [])
        .map((r) => DOC_TYPE_MAP[r.document_type])
        .filter((t): t is AcademicDocumentType => Boolean(t)),
    ),
  ];
  const missingDocuments = ALL_ACADEMIC_TYPES.filter(
    (t) => !availableDocuments.includes(t),
  );

  let completenessNote: string;
  if (missingDocuments.length === 0) {
    completenessNote = "All academic documents are available for analysis.";
  } else if (availableDocuments.length === 0) {
    completenessNote =
      "No academic documents were provided. Recommendations are based on counselor notes only.";
  } else {
    completenessNote = `Available: ${availableDocuments.join(", ")}. Missing: ${missingDocuments.join(", ")}.`;
  }

  return { availableDocuments, missingDocuments, completenessNote };
}

export const module3RecommendationProvider: RecommendationProvider = {
  getApprovedStudentProfile,
  getRankedRecommendations,
  getAcademicEvidenceSummary,
};

function normalizeKeySignalDetails(
  value: unknown,
  fallbackSignals: string[],
): KeySignalDetail[] {
  if (Array.isArray(value)) {
    const details = value.reduce<KeySignalDetail[]>((acc, item) => {
        if (typeof item !== "object" || item === null) {
          return acc;
        }

        const record = item as Record<string, unknown>;
        const label =
          typeof record.label === "string"
            ? stripMarkdownEmphasis(record.label)
            : "";
        const detailValue =
          typeof record.value === "string"
            ? stripMarkdownEmphasis(record.value)
            : "";

        if (!label || !detailValue) {
          return acc;
        }

        const detail: KeySignalDetail = {
          label,
          value: detailValue,
          polarity: normalizePolarity(record.polarity),
        };

        if (typeof record.subNote === "string" && record.subNote.trim()) {
          detail.subNote = stripMarkdownEmphasis(record.subNote);
        }

        acc.push(detail);
        return acc;
      }, []);

    if (details.length > 0) {
      return details;
    }
  }

  return fallbackSignals.slice(0, 5).map((signal, index) => ({
    label: `Signal ${index + 1}`,
    value: signal,
    polarity: "neutral",
  }));
}

function normalizePolarity(value: unknown): KeySignalDetail["polarity"] {
  if (value === "positive" || value === "negative" || value === "neutral") {
    return value;
  }

  return "neutral";
}

/** A report is assembled only from the immutable profile and outputs of its run. */
export function runRecommendationProvider(profile: ApprovedProfile, recommendations: RankedRecommendationList): RecommendationProvider {
  if (recommendations.scoreContract !== "0-100-v1") throw new Error("Legacy scoring contract: regenerate analysis before producing a report.");
  const availableDocuments = Object.keys(profile.academicData).map((key) => key === "form137" ? "form137" : key) as AcademicDocumentType[];
  const missingDocuments = ALL_ACADEMIC_TYPES.filter((type) => !availableDocuments.includes(type));
  return {
    getApprovedStudentProfile: async (sessionId) => buildStudentProfile(sessionId, profile),
    getRankedRecommendations: async () => sanitizeRecommendationList(recommendations),
    getAcademicEvidenceSummary: async () => ({ availableDocuments, missingDocuments,
      documentStatuses: Object.fromEntries(ALL_ACADEMIC_TYPES.map((type) => [type,
        profile.inputEvidence?.documents.find((document) => DOC_TYPE_MAP[document.documentType] === type || document.documentType === type)?.status
          ?? (availableDocuments.includes(type) ? "provided" : "absent") ])),
      completenessNote: missingDocuments.length ? `Missing: ${missingDocuments.join(", ")}. Recommendations use only approved available inputs.` : "All academic documents are available for analysis." }),
  };
}
