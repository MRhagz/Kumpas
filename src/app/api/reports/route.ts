import { ReportAssemblyError, assembleReportData } from "@/lib/report/assembler";
import { pdfFileStore } from "@/lib/report/file-store";
import { renderReportPdf } from "@/lib/report/pdf-renderer";
import type { ReportGenerationResponse } from "@/lib/report/types";

export const runtime = "nodejs";

interface ReportRequestBody {
  sessionId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: ReportRequestBody;

  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!sessionId) {
    return Response.json({ error: "sessionId is required." }, { status: 400 });
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

    return Response.json(response);
  } catch (error) {
    if (error instanceof ReportAssemblyError) {
      return Response.json(
        { error: error.message, details: error.details },
        { status: 422 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Report generation failed.";

    return Response.json({ error: message }, { status: 500 });
  }
}
