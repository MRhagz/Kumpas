import { ReportAssemblyError, assembleReportData } from "@/lib/report/assembler";
import { normalizeReportSessionId, pdfFileStore } from "@/lib/report/file-store";
import { renderReportPdf } from "@/lib/report/pdf-renderer";
import type { ReportGenerationResponse } from "@/lib/report/types";

export const runtime = "nodejs";

interface ReportRequestBody {
  sessionId?: unknown;
}

const REPORT_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request): Promise<Response> {
  let body: ReportRequestBody;

  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    return createReportJsonResponse(
      { error: "Request body must be valid JSON." },
      400,
    );
  }

  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return createReportJsonResponse({ error: "sessionId is required." }, 400);
  }

  let sessionId: string;

  try {
    sessionId = normalizeReportSessionId(body.sessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid session id.";

    return createReportJsonResponse({ error: message }, 400);
  }

  try {
    const reportPayload = await assembleReportData(sessionId);
    const pdfBuffer = await renderReportPdf(reportPayload);
    const storedPdf = await pdfFileStore.uploadReportPdf(sessionId, pdfBuffer);

    const response: ReportGenerationResponse = {
      sessionId,
      downloadUrl: storedPdf.downloadUrl,
      expiresAt: storedPdf.expiresAt,
      generatedAt: reportPayload.generatedAt,
      byteLength: storedPdf.byteLength,
      recommendationCount:
        reportPayload.rankedRecommendations.recommendations.length,
      academicEvidence: reportPayload.academicEvidence,
      recommendations: reportPayload.rankedRecommendations.recommendations.map(
        (recommendation) => ({
          id: recommendation.id,
          rank: recommendation.rank,
          careerPath: recommendation.careerPath,
          alignmentScore: recommendation.alignmentScore,
          keySignals: recommendation.keySignals,
        }),
      ),
    };

    return createReportJsonResponse(response);
  } catch (error) {
    if (error instanceof ReportAssemblyError) {
      logReportGenerationFailure(sessionId, error, {
        status: 422,
        detailCount: error.details.length,
      });

      return createReportJsonResponse(
        { error: error.message, details: error.details },
        422,
      );
    }

    const message =
      error instanceof Error ? error.message : "Report generation failed.";

    logReportGenerationFailure(sessionId, error, { status: 500 });

    return createReportJsonResponse({ error: message }, 500);
  }
}

function createReportJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: REPORT_RESPONSE_HEADERS,
  });
}

function logReportGenerationFailure(
  sessionId: string,
  error: unknown,
  context: {
    status: number;
    detailCount?: number;
  },
): void {
  const message =
    error instanceof Error ? error.message : "Report generation failed.";

  console.error("[report-generation] failed", {
    sessionId,
    status: context.status,
    detailCount: context.detailCount,
    message,
  });
}
