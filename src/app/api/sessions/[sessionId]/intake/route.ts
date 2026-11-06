import { NextRequest } from "next/server";
import { notFoundResponse, requireUser, unauthorizedResponse, userOwnsSession } from "@/lib/auth/api-auth";
import { draftHeaders, intakeRpc, readIntakeDraft } from "@/lib/module2/intake-draft-store";
import { normalizeAcademicData, normalizeNotes } from "@/lib/module2/extraction-contract";
import { uploadErrorResponse } from "@/lib/module2/academic-upload-validation";
import type { ExtractionDraft, ExtractedAcademicData, Form137Data } from "@/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  try {
    return Response.json(await readIntakeDraft(sessionId, user.id), { headers: draftHeaders });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Could not load your intake draft." }, { status: 500, headers: draftHeaders });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  try {
    // Limit JSON before parsing; notes and extracted academic fields only.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (!reader) return Response.json({ error: "Missing draft." }, { status: 400 });
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 200_000) {
          await reader.cancel();
          return Response.json({ error: "Draft is too large." }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader?.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return Response.json({ error: "Invalid draft JSON." }, { status: 400 }); }
    if (!body || !Number.isInteger(body.revision) || body.revision < 0) {
      return Response.json({ error: "A saved draft revision is required." }, { status: 400 });
    }
    if (body.documentId) {
      const current = await readIntakeDraft(sessionId, user.id);
      const document = current.documents.find((item) => item.id === body.documentId);
      if (!document) return notFoundResponse();
      let data: ExtractedAcademicData;
      try {
        if (body.data?.type !== document.document_type) throw new Error("Category changed");
        data = normalizeAcademicData(document.document_type, body.data.data);
        // Source identity is immutable: edits change values, never the original subject identity.
        if (data.type === "form_137" && document.structured_data.type === "form_137") {
          const identity = (rows: Form137Data["subjects"]) => rows.map(({ id, name, year, grade_level }) => [id, name, year, grade_level ?? null]);
          if (JSON.stringify(identity(data.data.subjects)) !== JSON.stringify(identity(document.structured_data.data.subjects))) throw new Error("Source changed");
        }
      } catch { return Response.json({ error: "Enter valid academic values. Clear missing scores instead of entering zero." }, { status: 400 }); }
      const saved = await intakeRpc<ExtractionDraft>("save_extraction_draft", {
        p_session_id: sessionId, p_counselor_id: user.id, p_id: document.id, p_expected_revision: body.revision, p_data: data,
      });
      return Response.json({ revision: saved.draft_revision }, { headers: draftHeaders });
    }
    let notes;
    try { notes = normalizeNotes(body.notes); }
    catch { return Response.json({ error: "Enter valid note fields." }, { status: 400 }); }
    const saved = await intakeRpc<{ draft_revision: number }>("save_intake_notes", {
      p_session_id: sessionId, p_counselor_id: user.id, p_expected_revision: body.revision,
      p_notes: notes, p_source: null, p_extracted: false,
    });
    return Response.json({ revision: saved.draft_revision }, { headers: draftHeaders });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Could not save the draft. Retry saving before approval." }, { status: 500, headers: draftHeaders });
  }
}
