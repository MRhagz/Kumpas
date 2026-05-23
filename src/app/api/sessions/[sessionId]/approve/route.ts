import { type NextRequest } from "next/server";
import { studentProfileBuilder } from "@/lib/module2/student-profile-builder";
import type { CorrectionLog, ApprovedProfile } from "@/types";

interface ApproveBody {
  counselorNotes: ApprovedProfile["counselorNotes"];
  corrections?: CorrectionLog[];
}

const REQUIRED_FIELDS = ["careerGoal", "interests", "financial", "concerns", "impression"] as const;

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const body = (await request.json()) as ApproveBody;
    const { counselorNotes, corrections = [] } = body;

    if (!counselorNotes) {
      return Response.json({ error: "counselorNotes is required" }, { status: 400 });
    }

    for (const field of REQUIRED_FIELDS) {
      const raw = counselorNotes[field];
      if (typeof raw !== "string" || stripHtml(raw).length === 0) {
        return Response.json(
          { error: `counselorNotes.${field} is required and cannot be empty` },
          { status: 400 },
        );
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
