"use client";

import { Target, Heart, Wallet, Flag, MessageSquare } from "lucide-react";
import WysiwygField from "./wysiwyg-field";
import type { ExtractedNotes } from "@/lib/analysis-types";

const FIELDS = [
  {
    key: "careerGoal" as const,
    label: "Career Goal",
    icon: Target,
    iconBg: "#dcfce7",
    iconFg: "#166534",
    labelColor: "#166534",
    ph: "Start typing the student's career goal here…",
  },
  {
    key: "interests" as const,
    label: "Personal Interests & Strengths",
    icon: Heart,
    iconBg: "#fef08a",
    iconFg: "#854d0e",
    labelColor: "#b45309",
    ph: "Describe the student's interests and natural strengths…",
  },
  {
    key: "financial" as const,
    label: "Family & Financial Situation",
    icon: Wallet,
    iconBg: "#ecfccb",
    iconFg: "#3f6212",
    labelColor: "#3f6212",
    ph: "Note the family support situation and any financial constraints…",
  },
  {
    key: "concerns" as const,
    label: "Concerns & Red Flags",
    icon: Flag,
    iconBg: "#fee2e2",
    iconFg: "#991b1b",
    labelColor: "#b91c1c",
    ph: "Flag any mismatches or concerns you observed…",
  },
  {
    key: "impression" as const,
    label: "Counselor's Overall Impression",
    icon: MessageSquare,
    iconBg: "#d1fae5",
    iconFg: "#065f46",
    labelColor: "#065f46",
    ph: "Write your overall impression of the student…",
  },
] as const;

interface SessionNotesFormProps {
  value: ExtractedNotes;
  onChange: (v: ExtractedNotes) => void;
}

export default function SessionNotesForm({ value, onChange }: SessionNotesFormProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      {FIELDS.map((f) => (
        <WysiwygField
          key={f.key}
          label={f.label}
          icon={<f.icon size={12} />}
          iconBg={f.iconBg}
          iconFg={f.iconFg}
          labelColor={f.labelColor}
          placeholder={f.ph}
          htmlValue={value[f.key]}
          onChange={(html) => onChange({ ...value, [f.key]: html })}
        />
      ))}
    </div>
  );
}

export { FIELDS as SESSION_NOTE_FIELDS };
