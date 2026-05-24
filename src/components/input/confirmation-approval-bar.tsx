"use client";

import { Sparkles, Loader2 } from "lucide-react";
import type { ExtractedNotes } from "@/lib/analysis-types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function allFieldsFilled(notes: ExtractedNotes): boolean {
  return (
    stripHtml(notes.careerGoal).length > 0 &&
    stripHtml(notes.interests).length > 0 &&
    stripHtml(notes.financial).length > 0 &&
    stripHtml(notes.concerns).length > 0 &&
    stripHtml(notes.impression).length > 0
  );
}

interface ConfirmationApprovalBarProps {
  notes: ExtractedNotes;
  sessionId: string;
  isSubmitting: boolean;
  onApprove: () => void;
}

export default function ConfirmationApprovalBar({
  notes,
  sessionId: _sessionId,
  isSubmitting,
  onApprove,
}: ConfirmationApprovalBarProps) {
  const filled = allFieldsFilled(notes);
  const canApprove = filled && !isSubmitting;
  return (
    <div className="px-6 pb-6 sm:px-8 sm:pb-8">
      <button
        type="button"
        disabled={!canApprove}
        onClick={onApprove}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-charcoal py-4 text-[15px] font-semibold text-white transition-colors hover:bg-sage disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {isSubmitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Sparkles
            size={18}
            className={canApprove ? "animate-pulse group-hover:animate-spin" : ""}
          />
        )}
        {isSubmitting ? "Preparing analysis…" : "Begin Multi Agent Analysis"}
      </button>
      <p className="mt-3 text-center text-xs font-medium text-muted-text">
        {!filled ? (
          "Fill in all five session note fields to enable analysis"
        ) : (
          <span className="text-sage">All inputs ready. Click above to begin the analysis.</span>
        )}
      </p>
    </div>
  );
}
