"use client";

import { PenLine } from "lucide-react";
import SessionNotesForm from "./session-notes-form";
import type { ExtractedNotes } from "@/lib/analysis-types";

interface EditableFieldFormProps {
  value: ExtractedNotes;
  onChange: (v: ExtractedNotes) => void;
}

export default function EditableFieldForm({ value, onChange }: EditableFieldFormProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-black/[0.015] border-black/[0.06] text-charcoal-2 text-[13px] font-semibold">
        <PenLine size={16} className="text-sage" />
        Session Notes — Edit Below
        <span className="ml-auto text-[11px] font-medium text-muted-text">
          All five fields required
        </span>
      </div>
      <SessionNotesForm value={value} onChange={onChange} />
    </div>
  );
}
