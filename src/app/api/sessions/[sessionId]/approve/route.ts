import { type NextRequest } from "next/server";
import { studentProfileBuilder, type ReviewedInputs } from "@/lib/module2/student-profile-builder";
import { uploadErrorResponse } from "@/lib/module2/academic-upload-validation";
import { draftHeaders } from "@/lib/module2/intake-draft-store";
import type { ApprovedProfile } from "@/types";
import {
  notFoundResponse,
  requireUser,
  unauthorizedResponse,
  userOwnsSession,
} from "@/lib/auth/api-auth";

import { hasNoteText, REQUIRED_NOTE_FIELDS, OPTIONAL_NOTE_FIELDS } from "@/lib/notes-validation";

interface ApproveBody extends ReviewedInputs {
  notesReviewed?: boolean;
  counselorNotes: ApprovedProfile["counselorNotes"];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();

  try {
    let body: ApproveBody;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid approval JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object") return Response.json({ error: "Invalid approval." }, { status: 400 });
    const { counselorNotes } = body;

    if (body.notesReviewed !== true) {
      return Response.json({ error: "Confirm that notes exclude personal identifiers and confidential details" }, { status: 400 });
    }

    if (!counselorNotes || typeof counselorNotes !== "object" || Array.isArray(counselorNotes)) {
      return Response.json({ error: "counselorNotes is required" }, { status: 400 });
    }

    for (const field of REQUIRED_NOTE_FIELDS) {
      const raw = counselorNotes[field];
      if (!hasNoteText(raw)) {
        return Response.json(
          { error: `counselorNotes.${field} is required and cannot be empty` },
          { status: 400 },
        );
      }
    }

    for (const field of OPTIONAL_NOTE_FIELDS) {
      if (counselorNotes[field] === undefined) counselorNotes[field] = "";
      if (typeof counselorNotes[field] !== "string") {
        return Response.json({ error: `counselorNotes.${field} must be text` }, { status: 400 });
      }
    }

    if (!Number.isInteger(body.profileVersion) || body.profileVersion < 0 ||
        !Number.isInteger(body.notesRevision) || body.notesRevision < 0 ||
        !Array.isArray(body.documents) || body.documents.length > 3 ||
        body.documents.some((doc) => !doc || typeof doc.id !== "string" || !Number.isInteger(doc.revision) || doc.revision < 0) ||
        new Set(body.documents.map((doc) => doc.id)).size !== body.documents.length) {
      return Response.json({ error: "Reload and review the saved input revisions before approval." }, { status: 400 });
    }

    const approvedProfile = await studentProfileBuilder.buildAndSave({
      sessionId,
      counselorId: user.id,
      counselorNotes,
      profileVersion: body.profileVersion, notesRevision: body.notesRevision, documents: body.documents,
    });

    return Response.json({ approvedProfile, status: "approved" }, { headers: draftHeaders });
  } catch (err) {
    const response = uploadErrorResponse(err);
    if (response) return response;
    console.error("[approve route] approval_failed");
    return Response.json(
      { error: "Approval failed. Your draft is saved; retry approval." },
      { status: 500, headers: draftHeaders },
    );
  }
}
