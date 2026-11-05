import { type NextRequest } from "next/server";
import { studentProfileBuilder } from "@/lib/module2/student-profile-builder";
import type { CorrectionLog, ApprovedProfile } from "@/types";
import {
  notFoundResponse,
  requireUser,
  unauthorizedResponse,
  userOwnsSession,
} from "@/lib/auth/api-auth";

import { hasNoteText, REQUIRED_NOTE_FIELDS, OPTIONAL_NOTE_FIELDS } from "@/lib/notes-validation";

interface ApproveBody {
  notesReviewed?: boolean;
  counselorNotes: ApprovedProfile["counselorNotes"];
  corrections?: CorrectionLog[];
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
    const body = (await request.json()) as ApproveBody;
    const { counselorNotes, corrections = [] } = body;

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

    const approvedProfile = await studentProfileBuilder.buildAndSave({
      sessionId,
      counselorNotes,
      corrections,
    });

    return Response.json({ approvedProfile, status: "approved" });
  } catch (err) {
    console.error(`[approve route] sessionId=${sessionId}`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Approval failed" },
      { status: 500 },
    );
  }
}
