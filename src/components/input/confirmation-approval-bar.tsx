"use client";

import { requiredNotesFilled } from "@/lib/notes-validation";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ExtractedNotes } from "@/lib/analysis-types";

interface ConfirmationApprovalBarProps {
  notes: ExtractedNotes;
  notesReviewed: boolean;
  onNotesReviewedChange: (reviewed: boolean) => void;
  isSubmitting: boolean;
  documentsReady?: boolean;
  readinessMessage?: string;
  onApprove: () => void;
}

export default function ConfirmationApprovalBar({
  notes,
  notesReviewed,
  onNotesReviewedChange,
  isSubmitting,
  documentsReady = true,
  readinessMessage,
  onApprove,
}: ConfirmationApprovalBarProps) {
  const filled = requiredNotesFilled(notes);
  const canApprove = filled && notesReviewed && documentsReady && !isSubmitting;
  return (
    <div className="border-t border-sage/15 bg-sage/[0.03] p-5 sm:px-8 sm:py-6">
      <label className="mb-5 flex cursor-default has-[:disabled]:cursor-not-allowed items-start gap-3 text-sm leading-relaxed text-charcoal-2">
        <input type="checkbox" className="mt-1 size-4 shrink-0 cursor-default accent-forest disabled:cursor-not-allowed" checked={notesReviewed} disabled={isSubmitting}
          onChange={(event) => onNotesReviewedChange(event.target.checked)} />
        <span><span className="block font-medium text-ink">I have reviewed these notes and the academic values, including missing evidence.</span>
        <span className="mt-1 block text-xs text-muted-text">My notes exclude personal identifiers and confidential details. I am submitting only a prepared career-guidance summary.</span></span>
      </label>
      <button
        type="button"
        disabled={!canApprove}
        onClick={onApprove}
        aria-describedby="approval-readiness"
        className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-forest px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-sage disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : null}
        {isSubmitting ? "Preparing analysis…" : "Approve Inputs and Begin Analysis"}
        {!isSubmitting && <ArrowRight size={17} className="shrink-0" aria-hidden="true" />}
      </button>
      <p id="approval-readiness" className="mt-3 text-center text-xs leading-relaxed text-muted-text">
        {!documentsReady ? (
          readinessMessage || "Wait for selected documents to finish, or replace or remove failed uploads."
        ) : !filled ? (
          "Enter Career Goal (Undecided is valid) and Personal Interests and Strengths to enable analysis"
        ) : !notesReviewed ? (
          "Confirm your review of the notes before analysis"
        ) : (
          <span className="text-sage">Approve these saved values. Later saved changes require approval and analysis again.</span>
        )}
      </p>
    </div>
  );
}
