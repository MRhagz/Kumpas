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
      .sort((a, b) => b.grade - a.grade)
      .slice(0, 3)
      .map((s) => s.name);
    strengths.push(...topSubjects);
  }
  if (profile.academicData.ncae) {
    const topStrands = Object.entries(profile.academicData.ncae.strand_scores)
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
    .order("rank", { ascending: true });

  if (recErr) {
    throw new Error(`Failed to fetch recommendations: ${recErr.message}`);
  }
  if (!recs || recs.length === 0) {
    throw new Error(`No recommendations found for session ${sessionId}`);
  }

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
    status: r.status,
    degradedReason: r.degraded_reason ?? undefined,
    incompleteReason: r.incomplete_reason ?? undefined,
}));

  return {
    sessionId,
    generatedAt: recs[0]?.created_at ?? new Date().toISOString(),
    recommendations,
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
        const label = typeof record.label === "string" ? record.label.trim() : "";
        const detailValue =
          typeof record.value === "string" ? record.value.trim() : "";

        if (!label || !detailValue) {
          return acc;
        }

        const detail: KeySignalDetail = {
          label,
          value: detailValue,
          polarity: normalizePolarity(record.polarity),
        };

        if (typeof record.subNote === "string" && record.subNote.trim()) {
          detail.subNote = record.subNote.trim();
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
