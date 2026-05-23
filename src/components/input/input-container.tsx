"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Target,
  Heart,
  Wallet,
  Flag,
  MessageSquare,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  X,
  ScanText,
  Check,
  Info,
  PenLine,
} from "lucide-react";
import WysiwygField from "./wysiwyg-field";
import DocumentUploadPanel from "./document-upload-panel";
import ExtractionResultsPanel from "./extraction-results-panel";
import EditableFieldForm from "./editable-field-form";
import ConfirmationApprovalBar from "./confirmation-approval-bar";
import { toast } from "sonner";
import { EMPTY_NOTES } from "@/lib/analysis-types";
import type { ExtractedNotes } from "@/lib/analysis-types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import inputStyles from "@/styles/input.module.css";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  DocumentProcessingState,
  ExtractedAcademicData,
  UploadedDocument,
  CorrectionLog,
} from "@/types";

const GUIDE = [
  {
    icon: Target,
    title: "Section 1 — Career Goal",
    bullets: [
      "What course or career does the student want to pursue?",
      "Why do they want this? Write their exact words.",
      "How certain are they?",
      "Do they have a backup plan?",
    ],
  },
  {
    icon: Heart,
    title: "Section 2 — Personal Interests & Strengths",
    bullets: [
      "Subjects or activities they enjoy the most",
      "What they are naturally good at",
      "Topics that made them visibly excited during the interview",
    ],
  },
  {
    icon: Wallet,
    title: "Section 3 — Family & Financial Situation",
    bullets: [
      "Can the family support the preferred course?",
      "Is there family pressure toward a specific career?",
      "Any financial or logistical barriers?",
    ],
  },
  {
    icon: Flag,
    title: "Section 4 — Concerns & Red Flags",
    bullets: [
      "Any mismatch between stated goal and observed strengths",
      "Does the student understand what the career involves day-to-day?",
      "Signs external pressure is overriding genuine interest",
    ],
  },
  {
    icon: MessageSquare,
    title: "Section 5 — Counselor's Overall Impression",
    bullets: [
      "Free-form narrative — gut feel, confidence in their goals",
      "Anything not captured in sections above",
      "Recommended focus areas for AI analysis",
    ],
  },
];

type InputMode = "image" | "manual";

const SECTIONS_CONFIG = [
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

const IDLE_PROC: DocumentProcessingState = { step: "idle", progress: 0 };

export default function InputContainer() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const [slotFiles, setSlotFiles] = useState<{ 1: File | null; 2: File | null; 3: File | null }>({
    1: null,
    2: null,
    3: null,
  });
  const [slotTypes, setSlotTypes] = useState<{ 1: string; 2: string; 3: string }>({
    1: "",
    2: "",
    3: "",
  });
  const [slotProcessing, setSlotProcessing] = useState<{
    1: DocumentProcessingState;
    2: DocumentProcessingState;
    3: DocumentProcessingState;
  }>({ 1: { ...IDLE_PROC }, 2: { ...IDLE_PROC }, 3: { ...IDLE_PROC } });
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);

  const [activeTab, setActiveTab] = useState<InputMode>("image");
  const [pendingTab, setPendingTab] = useState<InputMode | null>(null);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [imageSectionsReady, setImageSectionsReady] = useState(false);
  const [imageSectionHtml, setImageSectionHtml] = useState<ExtractedNotes>(EMPTY_NOTES);
  const [manualSectionHtml, setManualSectionHtml] = useState<ExtractedNotes>(EMPTY_NOTES);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sectionHtml = activeTab === "image" ? imageSectionHtml : manualSectionHtml;

  useEffect(() => {
    fetch("/api/sessions", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setSessionId(d.sessionId))
      .catch(() => setSessionError("Could not start session. Please refresh the page."));
  }, []);

  const tabHasData = (tab: InputMode) => {
    if (tab === "image")
      return !!(notesFile || Object.values(imageSectionHtml).some((v) => v.trim() !== ""));
    return Object.values(manualSectionHtml).some((v) => v.trim() !== "");
  };

  const handleTabChange = (newTab: string) => {
    const target = newTab as InputMode;
    if (target === activeTab) return;
    if (tabHasData(activeTab)) {
      setPendingTab(target);
      setShowSwitchDialog(true);
    } else {
      setActiveTab(target);
    }
  };

  const resetImageState = () => {
    setNotesFile(null);
    setScanning(false);
    setScanError(null);
    setImageSectionsReady(false);
    setImageSectionHtml(EMPTY_NOTES);
  };

  const confirmTabSwitch = () => {
    if (!pendingTab) return;
    if (activeTab === "image") resetImageState();
    else setManualSectionHtml(EMPTY_NOTES);
    setActiveTab(pendingTab);
    setPendingTab(null);
    setShowSwitchDialog(false);
  };

  const extractSections = async (file: File) => {
    setScanning(true);
    setScanError(null);
    setImageSectionsReady(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-notes", { method: "POST", body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to extract notes");
      }
      const data = await res.json();
      setImageSectionHtml({
        careerGoal: data.careerGoal || "<p></p>",
        interests: data.interests || "<p></p>",
        financial: data.financial || "<p></p>",
        concerns: data.concerns || "<p></p>",
        impression: data.impression || "<p></p>",
      });
      setImageSectionsReady(true);
      toast.success("Notes extracted", {
        description: "AI Vision extracted your counselor notes",
        position: "top-center",
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setScanning(false);
    }
  };

  const handleNotesSelect = (f: File | null) => {
    if (!f) {
      resetImageState();
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Invalid file type", { position: "top-center" });
      return;
    }
    setNotesFile(f);
    extractSections(f);
  };

  const handleSlotFileChange = useCallback((index: 1 | 2 | 3, file: File | null) => {
    setSlotFiles((p) => ({ ...p, [index]: file }));
    if (!file) {
      setSlotProcessing((p) => ({ ...p, [index]: IDLE_PROC }));
      setUploadedDocs((d) => d.filter((u) => u.slotIndex !== index));
    } else {
      setSlotProcessing((p) => ({ ...p, [index]: { step: "ai_structuring", progress: 30 } }));
    }
  }, []);

  const handleSlotTypeChange = useCallback((index: 1 | 2 | 3, type: string) => {
    setSlotTypes((p) => ({ ...p, [index]: type }));
  }, []);

  const handleDocumentUploaded = useCallback((index: 1 | 2 | 3, result: UploadedDocument) => {
    setSlotProcessing((p) => ({
      ...p,
      [index]: { step: "complete", progress: 100, extractedData: result.extractedData },
    }));
    setUploadedDocs((d) => [...d.filter((u) => u.slotIndex !== index), result]);
    toast.success(`Document ${index} extracted`, {
      description: "PII redacted server-side",
      position: "top-center",
    });
  }, []);

  const handleUploadError = useCallback((index: 1 | 2 | 3, error: string) => {
    setSlotProcessing((p) => ({ ...p, [index]: { step: "error", progress: 0, error } }));
    toast.error(`Document ${index} failed`, { description: error, position: "top-center" });
  }, []);

  const handleDataUpdate = useCallback((slotIndex: number, data: ExtractedAcademicData) => {
    setUploadedDocs((d) =>
      d.map((u) => (u.slotIndex === slotIndex ? { ...u, extractedData: data } : u)),
    );
  }, []);

  const handleApprove = async () => {
    if (!sessionId) return;
    setIsSubmitting(true);
    try {
      const corrections: CorrectionLog[] = [];
      for (const doc of uploadedDocs) {
        if (doc.extractedData.type === "ncae" && doc.originalExtractedData.type === "ncae") {
          for (const strand of Object.keys(doc.extractedData.data.strand_scores)) {
            const orig = doc.originalExtractedData.data.strand_scores[strand];
            const curr = doc.extractedData.data.strand_scores[strand];
            if (orig !== curr)
              corrections.push({
                session_id: sessionId,
                field_name: `ncae_strand.${strand}`,
                extracted_value: String(orig ?? ""),
                corrected_value: String(curr),
              });
          }
        }
        if (doc.extractedData.type === "nat" && doc.originalExtractedData.type === "nat") {
          for (const sub of Object.keys(doc.extractedData.data.subjects)) {
            const orig = doc.originalExtractedData.data.subjects[sub];
            const curr = doc.extractedData.data.subjects[sub];
            if (orig !== curr)
              corrections.push({
                session_id: sessionId,
                field_name: `nat_subject.${sub}`,
                extracted_value: String(orig ?? ""),
                corrected_value: String(curr),
              });
          }
        }
        if (doc.extractedData.type === "form_137" && doc.originalExtractedData.type === "form_137") {
          doc.extractedData.data.subjects.forEach((s, i) => {
            const origGrade =
              doc.originalExtractedData.type === "form_137"
                ? doc.originalExtractedData.data.subjects[i]?.grade
                : undefined;
            if (origGrade !== s.grade)
              corrections.push({
                session_id: sessionId,
                // Include year so corrections from two Form 137s with the same subject names
                // (e.g. "Filipino" from elementary AND junior high) don't collide.
                field_name: `form137_subject.${s.year || "unknown"}.${s.name}`,
                extracted_value: String(origGrade ?? ""),
                corrected_value: String(s.grade),
              });
          });
        }
      }

      const res = await fetch(`/api/sessions/${sessionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counselorNotes: {
            careerGoal: sectionHtml.careerGoal,
            interests: sectionHtml.interests,
            financial: sectionHtml.financial,
            concerns: sectionHtml.concerns,
            impression: sectionHtml.impression,
          },
          corrections,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Approval failed");
      }
      router.push(`/analysis?session=${sessionId}`);
    } catch (err) {
      toast.error("Failed to start analysis", {
        description: err instanceof Error ? err.message : "Unknown error",
        position: "top-center",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sessionError) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="flex items-center gap-3 rounded-xl bg-red-light border border-red-soft/20 p-4 text-red-soft">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="text-[14px]">{sessionError}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 sm:px-6 relative animate-fade-in">
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-cream-light shadow-card">
        {/* Part 1: Counselor Notes */}
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-3 mb-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink leading-snug">
                Counselor Notes
                <span className="ml-2 inline-block align-middle rounded-full bg-sage px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Required
                </span>
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-text">
                Write your interview notes, take a clear photo, and upload it — or type them
                directly.
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-sage/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setGuideOpen(!guideOpen)}
              className="flex w-full items-center justify-between px-4 py-3 bg-sage/[0.07] text-sage text-[13px] font-medium cursor-pointer hover:bg-sage/[0.12] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Info size={16} />
                <span>Notes Format Guide — What to write in each section</span>
              </div>
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${guideOpen ? "rotate-180" : ""}`}
              />
            </button>
            {guideOpen && (
              <div className="p-4 space-y-4 animate-fade-in">
                {GUIDE.map((g) => (
                  <div key={g.title} className="flex gap-3">
                    <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-sage/10 text-sage">
                      <g.icon size={14} />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3 mb-1">
                        {g.title}
                      </h4>
                      <ul className="list-disc pl-4 text-[13px] text-charcoal-3 leading-relaxed">
                        {g.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl bg-cream-dark/60 p-4 mb-6">
            <div>
              <h3 className="text-sm font-semibold text-ink">Download &amp; Print the Notes Form</h3>
              <p className="text-xs text-muted-text">
                Pre-structured form you can fill out by hand during the session
              </p>
            </div>
            <a
              href="/kumpas_career_interview_notes.pdf"
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-sage px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sage/80 whitespace-nowrap"
            >
              <Download size={16} /> Download PDF
            </a>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-0">
            <TabsList className="w-full h-auto p-1 rounded-xl bg-cream-dark/80 border border-black/[0.06] mb-4">
              <TabsTrigger
                value="image"
                className="flex-1 gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-sage data-[state=active]:shadow-sm data-[state=inactive]:text-muted-text"
              >
                <ImageIcon size={15} /> Image Analysis
              </TabsTrigger>
              <TabsTrigger
                value="manual"
                className="flex-1 gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-sage data-[state=active]:shadow-sm data-[state=inactive]:text-muted-text"
              >
                <PenLine size={15} /> Manual Input
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="mt-0">
              {!notesFile ? (
                <div
                  className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-all animate-fade-in ${
                    drag
                      ? "border-sage bg-sage/[0.04]"
                      : "border-black/10 bg-cream/40 hover:border-black/20"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    handleNotesSelect(e.dataTransfer.files?.[0] || null);
                  }}
                  onClick={() => document.getElementById("notes-file-input")?.click()}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm text-sage">
                    <ImageIcon size={24} />
                  </div>
                  <p className="text-[15px] font-semibold text-ink">Upload photo of your notes</p>
                  <p className="mt-1 text-[13px] text-muted-text">
                    <span className="text-sage font-medium">Tap to choose</span> or drag &amp; drop
                    an image here
                  </p>
                  <input
                    id="notes-file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleNotesSelect(e.target.files?.[0] || null)}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-sage/20 bg-sage/[0.04] p-3 animate-fade-in">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
                        scanning ? "bg-amber" : scanError ? "bg-red-soft" : "bg-sage"
                      }`}
                    >
                      {scanning ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : scanError ? (
                        <AlertTriangle size={20} />
                      ) : (
                        <ImageIcon size={20} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {notesFile.name}
                      </p>
                      <p
                        className={`text-[11px] ${scanError ? "text-red-soft" : "text-muted-text"}`}
                      >
                        {scanning
                          ? "Reading handwriting with AI Vision…"
                          : scanError
                            ? scanError
                            : `${(notesFile.size / 1024).toFixed(0)} KB · Extracted & ready to edit`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        scanning
                          ? "bg-amber/15 text-amber"
                          : scanError
                            ? "bg-red-soft/15 text-red-soft"
                            : "bg-white border border-sage/20 text-sage"
                      }`}
                    >
                      {scanning ? (
                        "Scanning"
                      ) : scanError ? (
                        "Error"
                      ) : (
                        <>
                          <Check size={12} /> Scanned
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={resetImageState}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-black/30 hover:text-charcoal-2 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
                    <div
                      className={`flex items-center gap-2.5 px-4 py-3 border-b text-[13px] font-semibold ${
                        scanError
                          ? "bg-red-light border-red-soft/30 text-red-soft"
                          : "bg-black/[0.015] border-black/[0.06] text-charcoal-2"
                      }`}
                    >
                      <ScanText
                        size={16}
                        className={
                          scanning ? "text-amber" : scanError ? "text-red-soft" : "text-sage"
                        }
                      />
                      {scanning
                        ? "Extracting your notes…"
                        : scanError
                          ? "Extraction failed"
                          : "Extracted Notes — Edit Below"}
                      {!scanning && !scanError && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-text">
                          <Check size={14} className="text-sage" /> AI-extracted · editable
                        </span>
                      )}
                    </div>
                    {scanning && (
                      <div className="p-4 space-y-6">
                        {[37, 50, 42, 58, 65].map((w, i) => (
                          <div key={i} className="space-y-2">
                            <div
                              className={`h-3.5 rounded ${inputStyles.shimmer}`}
                              style={{ width: `${w}%` }}
                            />
                            <div
                              className={`rounded ${inputStyles.shimmer}`}
                              style={{ height: `${74 + i * 4}px` }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {scanError && (
                      <div className="flex items-start gap-3 p-4 bg-red-light text-red-soft text-[13px] leading-snug">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        Could not read the notes. Please ensure the image is clear and well-lit,
                        then try again.
                      </div>
                    )}
                    {imageSectionsReady &&
                      SECTIONS_CONFIG.map((s) => (
                        <WysiwygField
                          key={s.key}
                          label={s.label}
                          icon={<s.icon size={12} />}
                          iconBg={s.iconBg}
                          iconFg={s.iconFg}
                          labelColor={s.labelColor}
                          placeholder={s.ph}
                          htmlValue={imageSectionHtml[s.key]}
                          onChange={(h) =>
                            setImageSectionHtml((prev) => ({ ...prev, [s.key]: h }))
                          }
                        />
                      ))}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="manual" className="mt-0">
              <EditableFieldForm value={manualSectionHtml} onChange={setManualSectionHtml} />
            </TabsContent>
          </Tabs>
        </div>

        <hr className="border-t border-black/[0.06]" />

        {/* Part 2: DocumentUploadPanel */}
        {sessionId ? (
          <DocumentUploadPanel
            sessionId={sessionId}
            slots={{
              1: {
                file: slotFiles[1],
                docType: slotTypes[1],
                processingState: slotProcessing[1],
              },
              2: {
                file: slotFiles[2],
                docType: slotTypes[2],
                processingState: slotProcessing[2],
              },
              3: {
                file: slotFiles[3],
                docType: slotTypes[3],
                processingState: slotProcessing[3],
              },
            }}
            onSlotFileChange={handleSlotFileChange}
            onSlotTypeChange={handleSlotTypeChange}
            onDocumentUploaded={handleDocumentUploaded}
            onUploadError={handleUploadError}
          />
        ) : (
          <div className="p-6 sm:p-8 flex items-center gap-2 text-muted-text text-[13px]">
            <Loader2 size={16} className="animate-spin" /> Initializing session…
          </div>
        )}

        {/* Part 2.5: ExtractionResultsPanel */}
        {uploadedDocs.length > 0 && (
          <div className="px-6 sm:px-8 pb-4">
            <ExtractionResultsPanel documents={uploadedDocs} onDataUpdate={handleDataUpdate} />
          </div>
        )}

        {/* Part 3: ConfirmationApprovalBar */}
        {sessionId && (
          <ConfirmationApprovalBar
            notes={sectionHtml}
            sessionId={sessionId}
            isSubmitting={isSubmitting}
            onApprove={handleApprove}
          />
        )}
      </div>

      <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch input method?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved notes in the{" "}
              <strong>{activeTab === "image" ? "Image Analysis" : "Manual Input"}</strong> tab.
              Switching will discard your current input.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingTab(null);
                setShowSwitchDialog(false);
              }}
            >
              Stay here
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmTabSwitch}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Discard &amp; switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
