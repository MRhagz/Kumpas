"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Check,
  Edit3,
  ShieldCheck,
  Eye,
  X,
  GraduationCap,
  BookOpen,
  BarChart3,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type {
  ExtractedAcademicData,
  NCAEData,
  NATData,
  Form137Data,
  UploadedDocument,
} from "@/types";

const DOC_META: Record<string, { label: string; icon: typeof BarChart3; color: string }> = {
  ncae: { label: "NCAE Result", icon: BarChart3, color: "#3D6B3D" },
  form_137: { label: "Form 137", icon: GraduationCap, color: "#8B6914" },
  nat: { label: "NAT Result", icon: BookOpen, color: "#1E40AF" },
};

interface ExtractionResultsPanelProps {
  documents: UploadedDocument[];
  onDataUpdate: (slotIndex: number, data: ExtractedAcademicData) => void;
}

export default function ExtractionResultsPanel({
  documents,
  onDataUpdate,
}: ExtractionResultsPanelProps) {
  if (documents.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-sage/[0.04] border-sage/20 text-charcoal-2 text-[13px] font-semibold">
        <ShieldCheck size={16} className="text-sage" />
        Extracted Data — Review &amp; Confirm
        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-text">
          <Check size={14} className="text-sage" />
          {documents.length} document{documents.length > 1 ? "s" : ""} extracted · PII redacted
        </span>
      </div>
      {documents.length === 1 ? (
        <DocEditor doc={documents[0]} onDataUpdate={onDataUpdate} />
      ) : (
        <Tabs defaultValue={`slot-${documents[0].slotIndex}`} className="gap-0">
          <TabsList className="w-full h-auto p-1 rounded-none border-b border-black/[0.06] bg-black/[0.015]">
            {documents.map((d) => {
              const meta = DOC_META[d.docType];
              const Icon = meta?.icon ?? BarChart3;
              // Disambiguate when the same docType (e.g. multiple Form 137s) appears twice.
              const sameType = documents.filter((x) => x.docType === d.docType);
              const baseLabel = meta?.label ?? d.docType;
              const label =
                sameType.length > 1
                  ? `${baseLabel} #${sameType.findIndex((x) => x.slotIndex === d.slotIndex) + 1}`
                  : baseLabel;
              return (
                <TabsTrigger
                  key={d.slotIndex}
                  value={`slot-${d.slotIndex}`}
                  className="flex-1 gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-sage data-[state=inactive]:text-muted-text"
                >
                  <Icon size={14} /> {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {documents.map((d) => (
            <TabsContent key={d.slotIndex} value={`slot-${d.slotIndex}`} className="mt-0">
              <DocEditor doc={d} onDataUpdate={onDataUpdate} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function DocEditor({
  doc,
  onDataUpdate,
}: {
  doc: UploadedDocument;
  onDataUpdate: (i: number, d: ExtractedAcademicData) => void;
}) {
  const [showRedacted, setShowRedacted] = useState(false);
  const { extractedData, redactedImageUrl, slotIndex } = doc;
  return (
    <div className="p-4 space-y-4">
      {redactedImageUrl && (
        <div className="flex items-center gap-2 rounded-lg bg-sage/[0.06] border border-sage/15 px-3 py-2 text-[12px] text-sage">
          <ShieldCheck size={14} className="shrink-0" />
          <span className="font-medium">PII redacted server-side</span>
          <button
            type="button"
            onClick={() => setShowRedacted((s) => !s)}
            className="ml-auto flex items-center gap-1 text-[11px] font-medium text-sage hover:text-sage/80 cursor-pointer"
          >
            <Eye size={12} /> {showRedacted ? "Hide" : "View"} redacted image
          </button>
        </div>
      )}
      {showRedacted && redactedImageUrl && (
        <div className="relative rounded-lg border border-black/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRedacted(false)}
            className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 z-10 cursor-pointer"
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
      {extractedData.type === "ncae" && (
        <NCAEEditor
          data={extractedData.data}
          onChange={(d) => onDataUpdate(slotIndex, { type: "ncae", data: d })}
        />
      )}
      {extractedData.type === "nat" && (
        <NATEditor
          data={extractedData.data}
          onChange={(d) => onDataUpdate(slotIndex, { type: "nat", data: d })}
        />
      )}
      {extractedData.type === "form_137" && (
        <Form137Editor
          data={extractedData.data}
          onChange={(d) => onDataUpdate(slotIndex, { type: "form_137", data: d })}
        />
      )}
    </div>
  );
}

function NCAEEditor({ data, onChange }: { data: NCAEData; onChange: (d: NCAEData) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const update = useCallback(
    (strand: string, v: number) =>
      onChange({ ...data, strand_scores: { ...data.strand_scores, [strand]: v } }),
    [data, onChange],
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
                autoFocus
                onChange={(e) => update(strand, parseFloat(e.target.value) || 0)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(strand)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer"
              >
                {score}% <Edit3 size={11} className="text-muted-text" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NATEditor({ data, onChange }: { data: NATData; onChange: (d: NATData) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const update = useCallback(
    (sub: string, v: number) =>
      onChange({ ...data, subjects: { ...data.subjects, [sub]: v } }),
    [data, onChange],
  );
  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">
        NAT Subject Scores
      </h4>
      <div className="grid gap-2">
        {Object.entries(data.subjects).map(([sub, score]) => (
          <div key={sub} className="flex items-center gap-3 rounded-lg bg-black/[0.015] p-2.5">
            <span className="flex-1 text-[13px] text-charcoal-2 font-medium">{sub}</span>
            {editing === sub ? (
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                autoFocus
                onChange={(e) => update(sub, parseFloat(e.target.value) || 0)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(sub)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer"
              >
                {score} <Edit3 size={11} className="text-muted-text" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Form137Editor({
  data,
  onChange,
}: {
  data: Form137Data;
  onChange: (d: Form137Data) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const updateGrade = useCallback(
    (idx: number, v: number) => {
      const updated = [...data.subjects];
      updated[idx] = { ...updated[idx], grade: v };
      onChange({ ...data, subjects: updated });
    },
    [data, onChange],
  );

  // Group by year while preserving original indices so edits dispatch correctly.
  const groups = useMemo(() => {
    const byYear = new Map<string, { idx: number; subject: Form137Data["subjects"][number] }[]>();
    data.subjects.forEach((subject, idx) => {
      const year = subject.year?.trim() || "Unspecified";
      const arr = byYear.get(year) ?? [];
      arr.push({ idx, subject });
      byYear.set(year, arr);
    });
    return Array.from(byYear.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data.subjects]);

  return (
    <div className="space-y-4">
      {groups.map(([year, rows]) => (
        <div key={year} className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">
            S.Y. {year}
          </h4>
          <div className="rounded-lg border border-black/[0.06] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-black/[0.06] bg-black/[0.015]">
                  <th className="px-3 py-2 text-left font-semibold text-charcoal-3 text-[11px] uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-charcoal-3 text-[11px] uppercase tracking-wider w-20">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ idx, subject }) => (
                  <tr
                    key={idx}
                    className="border-b border-black/[0.04] last:border-b-0 hover:bg-black/[0.01]"
                  >
                    <td className="px-3 py-2 text-charcoal-2 font-medium">{subject.name}</td>
                    <td className="px-3 py-2 text-right">
                      {editingIdx === idx ? (
                        <input
                          type="number"
                          min={60}
                          max={100}
                          value={subject.grade}
                          autoFocus
                          onChange={(e) => updateGrade(idx, parseFloat(e.target.value) || 0)}
                          onBlur={() => setEditingIdx(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingIdx(null)}
                          className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingIdx(idx)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer"
                        >
                          {subject.grade} <Edit3 size={10} className="text-muted-text" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
