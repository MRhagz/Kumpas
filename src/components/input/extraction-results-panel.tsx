"use client";

import type { ExtractedAcademicData, UploadedDocument } from "@/types";
import { academicFields } from "@/lib/module2/extraction-contract";

interface Props {
  documents: UploadedDocument[];
  onDataUpdate: (documentId: string, data: ExtractedAcademicData) => void;
}

const LABELS: Record<string, string> = { ncae: "NCAE", nat: "NAT", form_137: "Form 137" };

export default function ExtractionResultsPanel({ documents, onDataUpdate }: Props) {
  return <div className="space-y-4" aria-label="Academic evidence review">
    <h3 className="font-semibold">Extracted data — review and correct</h3>
    {documents.map((doc) => {
      const data = doc.extractedData;
      const original = academicFields(doc.originalExtractedData);
      const source = doc.provenance;
      const numeric = (key: string, label: string, value: number | null | undefined, min: number, change: (v: number | null) => void) =>
        <Field key={key} label={label} fieldKey={key} value={value ?? null} original={original[key] ?? null}
          type="number" min={min} onChange={(v) => change(v === "" ? null : Number(v))} />;
      const text = (key: string, label: string, value: string | null | undefined, change: (v: string | null) => void) =>
        <Field key={key} label={label} fieldKey={key} value={value ?? null} original={original[key] ?? null}
          type="text" onChange={(v) => change(v || null)} />;
      const update = (next: ExtractedAcademicData) => onDataUpdate(doc.documentId, next);
      return <section key={doc.documentId} className="rounded-xl border border-black/10 p-4 space-y-3">
        <h4 className="font-semibold">{LABELS[doc.docType]} · {doc.evidenceState ?? "provided"} · Review needed</h4>
        <p className="text-xs text-muted-text break-all">
          Source document: {source?.documentId ?? doc.documentId}. Page: {source?.page ?? "unavailable"}.
          {source?.extractedAt ? ` Extracted ${source.extractedAt}.` : " Historical extraction details unavailable."}
          {source?.model && ` Model: ${source.model}. Prompt: ${source.promptVersion}.`}
        </p>
        {doc.evidenceState && doc.evidenceState !== "provided" ?
          <p className="text-sm">No usable scores were extracted. Replace or remove this document, or continue with missing evidence.</p> : <>
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
        </>}
      </section>;
    })}
  </div>;
}

function Field({ label, fieldKey, value, original, type, min, onChange }: {
  label: string; fieldKey: string; value: string | number | null; original: string | number | null;
  type: "text" | "number"; min?: number; onChange: (value: string) => void;
}) {
  const state = value !== original ? "Corrected" : value === null ? "Missing" : "Extracted";
  return <label className="block rounded-lg bg-black/[0.02] p-3 text-sm">
    <span className="block font-medium">{label}</span>
    <span className="block text-xs text-muted-text">{state} · Review needed · Field: {fieldKey}</span>
    <input className="mt-1 w-full rounded border border-black/20 bg-white px-2 py-1 focus-visible:outline-2 focus-visible:outline-sage"
      aria-label={label} type={type} value={value ?? ""} min={min} max={type === "number" ? 100 : undefined}
      step={type === "number" ? "any" : undefined} maxLength={type === "text" ? 200 : undefined}
      placeholder="Not provided" onChange={(event) => onChange(event.target.value)} />
  </label>;
}
