"use client";

import { useId, useState } from "react";
import type { ExtractedAcademicData, UploadedDocument } from "@/types";
import { academicFields } from "@/lib/module2/extraction-contract";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  documents: UploadedDocument[];
  onDataUpdate: (documentId: string, data: ExtractedAcademicData) => void;
}

const LABELS: Record<string, string> = { ncae: "NCAE", nat: "NAT", form_137: "Form 137" };

export default function ExtractionResultsPanel({ documents, onDataUpdate }: Props) {
  const [selectedDocumentId, setSelectedDocumentId] = useState(documents[0]?.documentId ?? "");
  const activeDocumentId = documents.some((doc) => doc.documentId === selectedDocumentId)
    ? selectedDocumentId : documents[0]?.documentId;
  if (!documents.length) return null;

  return <div className="space-y-4" aria-label="Academic evidence review">
    <h3 className="font-semibold">Extracted data — review and correct</h3>
    <Tabs value={activeDocumentId} onValueChange={setSelectedDocumentId} className="gap-3">
      <TabsList aria-label="Extracted documents" className="w-full rounded-xl border border-black/[0.08] bg-cream-dark/60 p-1 group-data-[orientation=horizontal]/tabs:h-auto">
        {documents.map((doc) => <TabsTrigger key={doc.documentId} value={doc.documentId}
          className="min-h-10 cursor-pointer px-3 text-xs data-[state=active]:bg-white data-[state=active]:text-forest sm:text-sm">
          {LABELS[doc.docType]}
        </TabsTrigger>)}
      </TabsList>
    {documents.map((doc) => {
      const data = doc.extractedData;
      const original = academicFields(doc.originalExtractedData);
      const source = doc.provenance;
      const numeric = (key: string, label: string, value: number | null | undefined, min: number, change: (v: number | null) => void) =>
        <Field key={key} label={label} value={value ?? null} original={original[key] ?? null}
          type="number" min={min} onChange={(v) => change(v === "" ? null : Number(v))} />;
      const text = (key: string, label: string, value: string | null | undefined, change: (v: string | null) => void) =>
        <Field key={key} label={label} value={value ?? null} original={original[key] ?? null}
          type="text" onChange={(v) => change(v || null)} />;
      const update = (next: ExtractedAcademicData) => onDataUpdate(doc.documentId, next);
      return <TabsContent key={doc.documentId} value={doc.documentId} className="min-w-0 rounded-xl border border-black/10 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">{LABELS[doc.docType]} · {doc.evidenceState ?? "provided"}</h4>
          <span className="rounded-full bg-ochre-pale px-2.5 py-1 text-xs font-medium text-ochre">Review needed</span>
        </div>
        <details className="text-xs text-muted-text">
          <summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-sage">Extraction details</summary>
          <p className="mt-2 break-all leading-relaxed">
          Source document: {source?.documentId ?? doc.documentId}. Page: {source?.page ?? "unavailable"}.
          {source?.extractedAt ? ` Extracted ${source.extractedAt}.` : " Historical extraction details unavailable."}
          {source?.model && ` Model: ${source.model}. Prompt: ${source.promptVersion}.`}
          </p>
        </details>
        {doc.evidenceState && doc.evidenceState !== "provided" ?
          <p className="text-sm">No usable scores were extracted. Replace or remove this document, or continue with missing evidence.</p> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.type === "ncae" && <>
            {Object.entries(data.data.strand_scores).map(([name, value]) => numeric(`strand_scores.${name}`, name, value, 0,
              (v) => update({ ...data, data: { ...data.data, strand_scores: { ...data.data.strand_scores, [name]: v } } })))}
            {numeric("overall_percentile", "Overall percentile", data.data.overall_percentile, 0,
              (v) => update({ ...data, data: { ...data.data, overall_percentile: v } }))}
            {text("recommended_strand", "Printed recommended strand", data.data.recommended_strand,
              (v) => update({ ...data, data: { ...data.data, recommended_strand: v } }))}
          </>}
          {data.type === "nat" && <>
            {Object.entries(data.data.subjects).map(([name, value]) => numeric(`subjects.${name}`, name, value, 0,
              (v) => update({ ...data, data: { ...data.data, subjects: { ...data.data.subjects, [name]: v } } })))}
            {numeric("composite_score", "NAT composite", data.data.composite_score, 0,
              (v) => update({ ...data, data: { ...data.data, composite_score: v } }))}
            {text("mastery_level", "Printed mastery level", data.data.mastery_level,
              (v) => update({ ...data, data: { ...data.data, mastery_level: v } }))}
          </>}
          {data.type === "form_137" && <>
            {data.data.subjects.map((row, i) => numeric(`subjects.${row.id ?? i}.grade`,
              `${row.name} · ${row.grade_level ?? "Grade level unavailable"} · ${row.year || "School year unavailable"}`, row.grade, 60,
              (v) => update({ ...data, data: { ...data.data, subjects: data.data.subjects.map((s, n) => n === i ? { ...s, grade: v } : s) } })))}
            {numeric("gwa", "Printed overall GWA", data.data.gwa, 60,
              (v) => update({ ...data, data: { ...data.data, gwa: v } }))}
            {text("school_year", "Most recent printed school year", data.data.school_year,
              (v) => update({ ...data, data: { ...data.data, school_year: v } }))}
          </>}
        </div>}
      </TabsContent>;
    })}
    </Tabs>
  </div>;
}

function Field({ label, value, original, type, min, onChange }: {
  label: string; value: string | number | null; original: string | number | null;
  type: "text" | "number"; min?: number; onChange: (value: string) => void;
}) {
  const id = useId();
  const state = value !== original ? "Corrected" : value === null ? "Missing" : "Extracted";
  return <label className={`flex min-w-0 flex-col gap-2 rounded-lg bg-black/[0.02] p-2.5 text-sm ${type === "text" ? "lg:col-span-2" : ""}`}>
    <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
      <span className="min-w-0 flex-1 font-medium text-xs leading-relaxed sm:text-sm">{label}</span>
      <span id={id} className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${state === "Corrected" ? "bg-sage/10 text-forest" : "text-muted-text"}`}>{state}</span>
    </span>
    <input className="mt-auto min-h-10 w-full rounded border border-black/20 bg-white px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-sage"
      aria-label={label} aria-describedby={id} type={type} value={value ?? ""} min={min} max={type === "number" ? 100 : undefined}
      step={type === "number" ? "any" : undefined} maxLength={type === "text" ? 200 : undefined}
      placeholder="Not provided" onChange={(event) => onChange(event.target.value)} />
  </label>;
}
