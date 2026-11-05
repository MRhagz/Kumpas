"use client";

import { requiredNotesFilled } from "@/lib/notes-validation";
import { Sparkles, Loader2 } from "lucide-react";
import type { ExtractedNotes } from "@/lib/analysis-types";

interface ConfirmationApprovalBarProps {
  notes: ExtractedNotes;
  notesReviewed: boolean;
  onNotesReviewedChange: (reviewed: boolean) => void;
  isSubmitting: boolean;
  documentsReady?: boolean;
  onApprove: () => void;
}

export default function ConfirmationApprovalBar({
  notes,
  notesReviewed,
  onNotesReviewedChange,
  isSubmitting,
  documentsReady = true,
  onApprove,
}: ConfirmationApprovalBarProps) {
  const filled = requiredNotesFilled(notes);
  const canApprove = filled && notesReviewed && documentsReady && !isSubmitting;
  return (
    <div className="px-6 pb-6 sm:px-8 sm:pb-8">
      <label className="mb-4 flex items-start gap-2 text-sm text-charcoal-2">
        <input type="checkbox" checked={notesReviewed} disabled={isSubmitting}
          onChange={(event) => onNotesReviewedChange(event.target.checked)} />
        I have reviewed these notes and confirm that they exclude personal identifiers
        and confidential details. I am submitting only a prepared career-guidance summary.
      </label>
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
        {isSubmitting ? "Preparing analysis…" : "Approve Inputs and Begin Analysis"}
      </button>
      <p className="mt-3 text-center text-xs font-medium text-muted-text">
        {!documentsReady ? (
          "Wait for selected documents to finish, or replace or remove failed uploads."
        ) : !filled ? (
          "Enter Career Goal (Undecided is valid) and Personal Interests and Strengths to enable analysis"
        ) : !notesReviewed ? (
          "Confirm your review of the notes before analysis"
        ) : (
          <span className="text-sage">All inputs ready. Click above to begin the analysis.</span>
        )}
      </p>
    </div>
  );
}
