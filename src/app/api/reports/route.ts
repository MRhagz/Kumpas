import { ReportAssemblyError, assembleReportData } from "@/lib/report/assembler";
import { pdfFileStore } from "@/lib/report/file-store";
import { renderReportPdf } from "@/lib/report/pdf-renderer";

interface GenerateReportRequest {
  sessionId?: unknown;
}

interface GenerateReportResponse {
  sessionId: string;
  token: string;
  downloadUrl: string;
  expiresAt: string;
  byteLength: number;
}

export async function POST(request: Request): Promise<Response> {
  let body: GenerateReportRequest;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const sessionId = normalizeSessionId(body.sessionId);

  if (!sessionId) {
    return Response.json({ error: "Missing required field: sessionId." }, { status: 400 });
  }

  try {
    const reportPayload = await assembleReportData(sessionId);
    const pdfResult = await renderReportPdf(reportPayload);
    const tokenRecord = pdfFileStore.registerPdf(sessionId, pdfResult.filePath);
    const response: GenerateReportResponse = {
      sessionId,
      token: tokenRecord.token,
      downloadUrl: `/api/reports/${tokenRecord.token}?sessionId=${encodeURIComponent(sessionId)}`,
      expiresAt: tokenRecord.expiresAt,
      byteLength: pdfResult.byteLength,
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof ReportAssemblyError) {
      return Response.json(
        {
          error: error.message,
          details: error.details,
        },
        { status: 422 },
      );
    }

    console.error("[reports] Failed to generate report PDF:", error);
    return Response.json({ error: "Failed to generate report PDF." }, { status: 500 });
  }
}

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sessionId = value.trim();
  return sessionId.length > 0 ? sessionId : null;
}
