import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { pdfFileStore } from "@/lib/report/file-store";

interface ReportDownloadContext {
  params: Promise<{
    token: string;
  }>;
}

export async function GET(
  request: Request,
  context: ReportDownloadContext,
): Promise<Response> {
  const { token } = await context.params;
  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return Response.json({ error: "Missing required query parameter: sessionId." }, { status: 400 });
  }

  const tokenRecord = pdfFileStore.getPdf(token, sessionId);

  if (!tokenRecord) {
    return Response.json({ error: "Report PDF was not found or has expired." }, { status: 404 });
  }

  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await readFile(tokenRecord.filePath);
  } catch (error) {
    console.error("[reports] Registered PDF file is unavailable:", error);
    pdfFileStore.revokeToken(token);
    return Response.json({ error: "Report PDF is no longer available." }, { status: 410 });
  }

  const pdfBody = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength,
  ) as ArrayBuffer;

  return new Response(pdfBody, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${basename(tokenRecord.filePath)}"`,
      "Content-Length": pdfBuffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
}
