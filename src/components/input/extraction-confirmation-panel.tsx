/**
 * ExtractionConfirmationPanel — editable confirmation interface
 * per SDD Module 2.2.
 *
 * Tabbed display showing extracted academic data per document type.
 * Counselor can review, edit, and confirm extracted values before analysis.
 */

"use client";

import { useState, useCallback } from "react";
import {
  Check,
  Edit3,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Eye,
  X,
  GraduationCap,
  BookOpen,
  BarChart3,
} from "lucide-react";
import type {
  ExtractedAcademicData,
  NCAEData,
  NATData,
  Form137Data,
  DocumentProcessingState,
} from "@/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* ─── Props ─── */

interface SlotData {
  index: number;
  docType: string;
  processingState: DocumentProcessingState;
}

interface ExtractionConfirmationPanelProps {
  slots: SlotData[];
  onDataUpdate: (slotIndex: number, data: ExtractedAcademicData) => void;
}

/* ─── Type labels & icons ─── */

const DOC_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  ncae: { label: "NCAE Result", icon: BarChart3, color: "#3D6B3D" },
  form_137: { label: "Form 137", icon: GraduationCap, color: "#8B6914" },
  nat: { label: "NAT Result", icon: BookOpen, color: "#1E40AF" },
};

/* ─── Main Component ─── */

export default function ExtractionConfirmationPanel({
  slots,
  onDataUpdate,
}: ExtractionConfirmationPanelProps) {
  // Only show slots that have completed extraction
  const completedSlots = slots.filter(
    (s) => s.processingState.step === "complete" && s.processingState.extractedData
  );

  if (completedSlots.length === 0) return null;

  const firstType = completedSlots[0].docType;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
      {/* Panel Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-sage/[0.04] border-sage/20 text-charcoal-2 text-[13px] font-semibold">
        <ShieldCheck size={16} className="text-sage" />
        Extracted Data — Review &amp; Confirm
        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-text">
          <Check size={14} className="text-sage" /> {completedSlots.length} document{completedSlots.length > 1 ? "s" : ""} extracted
        </span>
      </div>

      {/* Tabs per document */}
      {completedSlots.length === 1 ? (
        <DocumentDataEditor
          slot={completedSlots[0]}
          onDataUpdate={onDataUpdate}
        />
      ) : (
        <Tabs defaultValue={firstType} className="gap-0">
          <TabsList className="w-full h-auto p-1 rounded-none border-b border-black/[0.06] bg-black/[0.015]">
            {completedSlots.map((s) => {
              const meta = DOC_META[s.docType];
              const Icon = meta?.icon ?? FileText;
              return (
                <TabsTrigger
                  key={s.index}
                  value={`slot-${s.index}`}
                  className="flex-1 gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-sage data-[state=inactive]:text-muted-text"
                >
                  <Icon size={14} /> {meta?.label ?? s.docType}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {completedSlots.map((s) => (
            <TabsContent key={s.index} value={`slot-${s.index}`} className="mt-0">
              <DocumentDataEditor slot={s} onDataUpdate={onDataUpdate} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

/* ─── Per-Document Editor ─── */

function DocumentDataEditor({
  slot,
  onDataUpdate,
}: {
  slot: SlotData;
  onDataUpdate: (slotIndex: number, data: ExtractedAcademicData) => void;
}) {
  const { processingState, index } = slot;
  const data = processingState.extractedData;
  const redactedImageUrl = processingState.redactedImageUrl;
  const piiCount = processingState.piiMatches?.length ?? 0;

  const [showRedacted, setShowRedacted] = useState(false);

  if (!data) return null;

  return (
    <div className="p-4 space-y-4">
      {/* PII Summary */}
      {piiCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-sage/[0.06] border border-sage/15 px-3 py-2 text-[12px] text-sage">
          <ShieldCheck size={14} className="shrink-0" />
          <span className="font-medium">
            {piiCount} personal identifier{piiCount > 1 ? "s" : ""} redacted
          </span>
          {redactedImageUrl && (
            <button
              type="button"
              onClick={() => setShowRedacted(!showRedacted)}
              className="ml-auto flex items-center gap-1 text-[11px] font-medium text-sage hover:text-sage/80 cursor-pointer"
            >
              <Eye size={12} /> {showRedacted ? "Hide" : "View"} redacted image
            </button>
          )}
        </div>
      )}

      {/* Redacted image preview */}
      {showRedacted && redactedImageUrl && (
        <div className="relative rounded-lg border border-black/[0.06] overflow-hidden">
          <button
            type="button"
            className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 z-10 cursor-pointer"
            onClick={() => setShowRedacted(false)}
          >
            <X size={12} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={redactedImageUrl}
            alt="Redacted document"
            className="w-full max-h-[400px] object-contain bg-black/[0.02]"
          />
        </div>
      )}

      {/* Data editor based on type */}
      {data.type === "ncae" && (
        <NCAEEditor
          data={data.data}
          onChange={(d) => onDataUpdate(index, { type: "ncae", data: d })}
        />
      )}
      {data.type === "nat" && (
        <NATEditor
          data={data.data}
          onChange={(d) => onDataUpdate(index, { type: "nat", data: d })}
        />
      )}
      {data.type === "form_137" && (
        <Form137Editor
          data={data.data}
          onChange={(d) => onDataUpdate(index, { type: "form_137", data: d })}
        />
      )}
    </div>
  );
}

/* ─── NCAE Editor ─── */

function NCAEEditor({
  data,
  onChange,
}: {
  data: NCAEData;
  onChange: (data: NCAEData) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const updateScore = useCallback(
    (strand: string, value: number) => {
      onChange({
        ...data,
        strand_scores: { ...data.strand_scores, [strand]: value },
      });
    },
    [data, onChange]
  );

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">
        NCAE Strand Scores
      </h4>
      <div className="grid gap-2">
        {Object.entries(data.strand_scores).map(([strand, score]) => (
          <div key={strand} className="flex items-center gap-3 rounded-lg bg-black/[0.015] p-2.5">
            <span className="flex-1 text-[13px] text-charcoal-2 font-medium">{strand}</span>
            {editing === strand ? (
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => updateScore(strand, parseFloat(e.target.value) || 0)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                autoFocus
                className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(strand)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer transition-colors"
              >
                {score}%
                <Edit3 size={11} className="text-muted-text" />
              </button>
            )}
          </div>
        ))}
      </div>

      {data.overall_percentile !== undefined && (
        <div className="flex items-center justify-between rounded-lg bg-sage/[0.06] border border-sage/15 p-2.5">
          <span className="text-[13px] font-medium text-sage">Overall Percentile</span>
          <span className="text-[13px] font-bold text-sage">{data.overall_percentile}%</span>
        </div>
      )}

      {data.recommended_strand && (
        <div className="flex items-center gap-2 text-[12px] text-muted-text">
          <GraduationCap size={14} />
          Recommended: <span className="font-semibold text-charcoal-2">{data.recommended_strand}</span>
        </div>
      )}
    </div>
  );
}

/* ─── NAT Editor ─── */

function NATEditor({
  data,
  onChange,
}: {
  data: NATData;
  onChange: (data: NATData) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const updateScore = useCallback(
    (subject: string, value: number) => {
      onChange({
        ...data,
        subjects: { ...data.subjects, [subject]: value },
      });
    },
    [data, onChange]
  );

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">
        NAT Subject Scores
      </h4>
      <div className="grid gap-2">
        {Object.entries(data.subjects).map(([subject, score]) => (
          <div key={subject} className="flex items-center gap-3 rounded-lg bg-black/[0.015] p-2.5">
            <span className="flex-1 text-[13px] text-charcoal-2 font-medium">{subject}</span>
            {editing === subject ? (
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => updateScore(subject, parseFloat(e.target.value) || 0)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                autoFocus
                className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(subject)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer transition-colors"
              >
                {score}
                <Edit3 size={11} className="text-muted-text" />
              </button>
            )}
          </div>
        ))}
      </div>

      {data.composite_score !== undefined && (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 p-2.5">
          <span className="text-[13px] font-medium text-blue-800">Composite Score</span>
          <span className="text-[13px] font-bold text-blue-800">{data.composite_score}</span>
        </div>
      )}

      {data.mastery_level && (
        <div className="flex items-center gap-2 text-[12px] text-muted-text">
          <BarChart3 size={14} />
          Mastery Level: <span className="font-semibold text-charcoal-2">{data.mastery_level}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Form 137 Editor ─── */

function Form137Editor({
  data,
  onChange,
}: {
  data: Form137Data;
  onChange: (data: Form137Data) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const updateGrade = useCallback(
    (idx: number, value: number) => {
      const updated = [...data.subjects];
      updated[idx] = { ...updated[idx], grade: value };
      onChange({ ...data, subjects: updated });
    },
    [data, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">
          Subject Grades
        </h4>
        {data.school_year && (
          <span className="text-[11px] text-muted-text">S.Y. {data.school_year}</span>
        )}
      </div>

      <div className="rounded-lg border border-black/[0.06] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-black/[0.06] bg-black/[0.015]">
              <th className="px-3 py-2 text-left font-semibold text-charcoal-3 text-[11px] uppercase tracking-wider">Subject</th>
              <th className="px-3 py-2 text-right font-semibold text-charcoal-3 text-[11px] uppercase tracking-wider w-20">Grade</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((subject, i) => (
              <tr key={i} className="border-b border-black/[0.04] last:border-b-0 hover:bg-black/[0.01]">
                <td className="px-3 py-2 text-charcoal-2 font-medium">{subject.name}</td>
                <td className="px-3 py-2 text-right">
                  {editingIdx === i ? (
                    <input
                      type="number"
                      min={60}
                      max={100}
                      value={subject.grade}
                      onChange={(e) => updateGrade(i, parseFloat(e.target.value) || 0)}
                      onBlur={() => setEditingIdx(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingIdx(null)}
                      autoFocus
                      className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingIdx(i)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer transition-colors"
                    >
                      {subject.grade}
                      <Edit3 size={10} className="text-muted-text" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.gwa !== undefined && (
        <div className="flex items-center justify-between rounded-lg bg-ochre-pale border border-ochre/15 p-2.5">
          <span className="text-[13px] font-medium text-ochre">General Weighted Average</span>
          <span className="text-[13px] font-bold text-ochre">{data.gwa}</span>
        </div>
      )}
    </div>
  );
}
