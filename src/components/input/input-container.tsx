"use client";
import { uploadIntakeFile } from "@/lib/intake-file-upload";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  ClipboardCheck,
  Save,
} from "lucide-react";
import SessionNotesForm from "./session-notes-form";
import ProcessingNotice from "./processing-notice";
import { requiredNotesFilled } from "@/lib/notes-validation";
import DocumentUploadPanel from "./document-upload-panel";
import ExtractionResultsPanel from "./extraction-results-panel";
import EditableFieldForm from "./editable-field-form";
import ConfirmationApprovalBar from "./confirmation-approval-bar";
import IngestionFreshnessPanel from "./ingestion-freshness-panel";
import SessionProgressIndicator from "@/components/session/session-progress-indicator";
import SessionTerminationControl from "@/components/session/session-termination-control";
import { toast } from "sonner";
import { EMPTY_NOTES } from "@/lib/analysis-types";
import type { ExtractedNotes } from "@/lib/analysis-types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { IntakeDraft } from "@/lib/module2/intake-draft-store";
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
} from "@/types";

const GUIDE = [
  {
    icon: Target,
    title: "Section 1 — Career Goal",
    bullets: [
      "What course or career does the student want to pursue?",
      "Why do they want this? Include relevant details without identifiers.",
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

interface SessionStateResponse {
  sessionId: string;
  nextStep: "input" | "analysis" | "report" | "complete" | "start-new-session";
}

interface SlotFileEntry {
  file: File;
  processingState: DocumentProcessingState;
  uploaded: UploadedDocument | null;
}

type SlotKey = 1 | 2 | 3;
type SlotEntriesMap = Record<SlotKey, SlotFileEntry[]>;
const SLOT_KEYS: SlotKey[] = [1, 2, 3];
const EMPTY_ENTRIES: SlotEntriesMap = { 1: [], 2: [], 3: [] };

export default function InputContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumableSessionId = searchParams.get("session");
  const reviewingInputs = searchParams.get("edit") === "1";

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const terminationStarted = useRef(false);

  const [slotTypes, setSlotTypes] = useState<Record<SlotKey, string>>({
    1: "",
    2: "",
    3: "",
  });
  const [slotEntries, setSlotEntries] = useState<SlotEntriesMap>(EMPTY_ENTRIES);

  // Derived: every successfully-uploaded document across all slots, in slot/file order.
  const uploadedDocs: UploadedDocument[] = SLOT_KEYS.flatMap((s) =>
    slotEntries[s].map((e) => e.uploaded).filter((u): u is UploadedDocument => u !== null),
  );

  const [activeTab, setActiveTab] = useState<InputMode>("image");
  const switchOrigin = useRef<HTMLElement | null>(null);
  const [pendingTab, setPendingTab] = useState<InputMode | null>(null);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [imageSectionsReady, setImageSectionsReady] = useState(false);
  const [imageSectionHtml, setImageSectionHtml] = useState<ExtractedNotes>(EMPTY_NOTES);
  const [manualSectionHtml, setManualSectionHtml] = useState<ExtractedNotes>(EMPTY_NOTES);
  const [processingConfirmed, setProcessingConfirmed] = useState(false);
  const [notesReviewed, setNotesReviewed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sectionHtml = activeTab === "image" ? imageSectionHtml : manualSectionHtml;
  const hydratedSession = useRef<string | null>(null);
  const notesRevision = useRef(0);
  const profileVersion = useRef(0);
  const editGeneration = useRef(0);
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [notesSource, setNotesSource] = useState<Record<string, unknown> | null>(null);
  const markDraftChanged = () => {
    editGeneration.current++;
    setDirtyDraft(true);
    setNotesReviewed(false);
  };


  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        if (resumableSessionId) {
          if (hydratedSession.current === resumableSessionId) return;
          const response = await fetch(
            `/api/sessions/${encodeURIComponent(resumableSessionId)}`,
          );

          if (!response.ok) {
            if (response.status === 401) {
              const next = `/input?session=${encodeURIComponent(resumableSessionId)}`;
              window.location.replace(`/login?next=${encodeURIComponent(next)}`);
              return;
            }
            throw new Error(response.status === 404
              ? "This draft is unavailable. Return to your drafts or start a new session."
              : "Could not load your saved draft. Refresh to try again.");
          }

          const sessionState = (await response.json()) as SessionStateResponse;

          if (!reviewingInputs && (
            sessionState.nextStep === "analysis" ||
            sessionState.nextStep === "report" ||
            sessionState.nextStep === "complete"
          )) {
            router.replace(
              `/analysis?session=${encodeURIComponent(sessionState.sessionId)}`,
            );
            return;
          }

          if (sessionState.nextStep === "start-new-session") {
            throw new Error("This session has expired. Please start a new session.");
          }

          const draftResponse = await fetch(`/api/sessions/${encodeURIComponent(sessionState.sessionId)}/intake`);
          if (!draftResponse.ok) throw new Error("Could not load the intake draft. Reload before editing.");
          const draft = await draftResponse.json() as IntakeDraft;
          if (isMounted) {
            hydratedSession.current = sessionState.sessionId;
            setSessionId(sessionState.sessionId);
            profileVersion.current = draft.profileVersion;
            const next: SlotEntriesMap = { 1: [], 2: [], 3: [] };
            const types: Record<SlotKey, string> = { 1: "", 2: "", 3: "" };
            draft.documents.forEach((doc, index) => {
              const slot = SLOT_KEYS[index];
              if (!slot) return;
              types[slot] = doc.document_type;
              next[slot] = [{ file: new File([], "Saved academic record"), processingState: { step: "complete", progress: 100 },
                uploaded: { documentId: doc.id, slotIndex: slot, docType: doc.document_type,
                  extractedData: doc.structured_data, originalExtractedData: doc.original_data ?? doc.structured_data,
                  redactedImageUrl: null, revision: doc.draft_revision, evidenceState: doc.evidence_state, provenance: doc.provenance } }];
            });
            setSlotEntries(next);
            setSlotTypes(types);
            if (draft.notes) {
              const { careerGoal, interests, financial, concerns, impression, revision, source } = draft.notes;
              notesRevision.current = revision;
              setManualSectionHtml({ careerGoal, interests, financial, concerns, impression });
              setActiveTab("manual");
              setNotesSource(source);
            }
            setPendingUpload(draft.uploadPending);
            if (draft.uploadPending) setDraftError("An earlier upload is still processing. Reload after it finishes before approval.");
          }
          return;
        }

        const response = await fetch("/api/sessions", { method: "POST" });
        if (!response.ok) {
          throw new Error("Could not start session. Please refresh the page.");
        }

        const data = (await response.json()) as { sessionId?: string };
        if (!data.sessionId) {
          throw new Error("Could not start session. Please refresh the page.");
        }

        if (isMounted) {
          hydratedSession.current = data.sessionId;
          setSessionId(data.sessionId);
          window.history.replaceState(null, "", `/input?session=${encodeURIComponent(data.sessionId)}`);
        }
      } catch (error) {
        if (isMounted) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Could not start session. Please refresh the page.",
          );
        }
      }
    };

    initializeSession();

    return () => {
      isMounted = false;
    };
  }, [resumableSessionId, reviewingInputs, router]);

  const updateManualNotes = (notes: ExtractedNotes) => {
    markDraftChanged();
    setManualSectionHtml(notes);
  };
  const updateImageNotes = (notes: ExtractedNotes) => {
    markDraftChanged();
    setImageSectionHtml(notes);
  };

  const tabHasData = (tab: InputMode) => {
    if (tab === "image")
      return !!(notesFile || Object.values(imageSectionHtml).some((v) => v.trim() !== ""));
    return Object.values(manualSectionHtml).some((v) => v.trim() !== "");
  };

  const handleTabChange = (newTab: string) => {
    const target = newTab as InputMode;
    if (target === activeTab || scanning || savingDraft) return;
    setNotesReviewed(false);
    if (tabHasData(activeTab)) {
      switchOrigin.current = document.activeElement as HTMLElement;
      setPendingTab(target);
      setShowSwitchDialog(true);
    } else {
      setActiveTab(target);
    }
  };

  const resetImageState = () => {
    setNotesReviewed(false);
    setNotesFile(null);
    setScanning(false);
    setScanError(null);
    setImageSectionsReady(false);
    setImageSectionHtml(EMPTY_NOTES);
  };

  const confirmTabSwitch = () => {
    if (!pendingTab) return;
    markDraftChanged();
    if (activeTab === "image") resetImageState();
    else setManualSectionHtml(EMPTY_NOTES);
    setActiveTab(pendingTab);
    setPendingTab(null);
    setShowSwitchDialog(false);
  };

  const extractSections = async (file: File) => {
    if (!processingConfirmed || !sessionId || dirtyDraft || savingDraft) return;
    setNotesReviewed(false);
    setScanning(true);
    setScanError(null);
    setImageSectionsReady(false);
    try {
      const revision = notesRevision.current;
      const uploadId = await uploadIntakeFile(sessionId, file, { docType: "notes", notesReviewed: true, revision });
      const res = await fetch("/api/extract-notes", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, sessionId, revision, notesReviewed: true }) });
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
      notesRevision.current = data.revision;
      setNotesSource(data.source);
      setNotesFile(new File([], "Saved notes photograph"));
      setImageSectionsReady(true);
      markDraftChanged();
      toast.success("Notes extracted", {
        description: "AI Vision extracted your counselor notes",
        position: "top-center",
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setNotesFile(new File([], "Notes photograph released"));
      setScanning(false);
    }
  };

  const handleNotesSelect = (f: File | null) => {
    if (scanning || savingDraft) return;
    if (!f) {
      markDraftChanged();
      resetImageState();
      return;
    }
    if (!processingConfirmed || dirtyDraft || savingDraft || scanning) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Invalid file type", { position: "top-center" });
      return;
    }
    setNotesFile(f);
    extractSections(f);
  };

  const handleSlotFilesAdd = useCallback(
    (slot: SlotKey, files: File[]) => {
      const newEntries: SlotFileEntry[] = files.map((file) => ({
        file,
        processingState: { step: "ai_structuring", progress: 30 },
        uploaded: null,
      }));
      setSlotEntries((prev) => ({
        ...prev,
        [slot]: newEntries.slice(0, 1).map((entry) => ({ ...entry, uploaded: prev[slot][0]?.uploaded ?? null })),
      }));
    },
    [],
  );

  const handleSlotFileRemove = useCallback((slot: SlotKey, fileIdx: number) => {
    editGeneration.current++;
    setDirtyDraft(true);
    setNotesReviewed(false);
    setSlotEntries((prev) => ({
      ...prev,
      [slot]: prev[slot].filter((_, i) => i !== fileIdx),
    }));
  }, []);

  const handleSlotTypeChange = useCallback((slot: SlotKey, type: string) => {
    setSlotTypes((p) => ({ ...p, [slot]: type }));
    // Changing the type invalidates any already-uploaded files for this slot,
    // since extraction_results rows are typed at upload time.
    setSlotEntries((prev) => (prev[slot].length === 0 ? prev : { ...prev, [slot]: [] }));
  }, []);

  const handleDocumentUploaded = useCallback(
    (slot: SlotKey, file: File, result: UploadedDocument) => {
      setSlotEntries((prev) => {
        const entries = prev[slot];
        if (!entries.some((e) => e.file === file)) return prev; // file was removed mid-upload
        return {
          ...prev,
          [slot]: entries.map((e) =>
            e.file === file
              ? {
                  ...e,
                  processingState: {
                    step: "complete",
                    progress: 100,
                    extractedData: result.extractedData,
                  },
                  file: new File([], "Saved academic record"),
                  uploaded: result,
                }
              : e,
          ),
        };
      });
      setNotesReviewed(false);
      editGeneration.current++;
      setDirtyDraft(true);
      toast.success(`Document extracted`, {
        description: "Review the extracted evidence before approval",
        position: "top-center",
      });
    },
    [],
  );

  const handleUploadError = useCallback((slot: SlotKey, file: File, error: string) => {
    setSlotEntries((prev) => ({
      ...prev,
      [slot]: prev[slot].map((e) =>
        e.file === file ? { ...e, file: new File([], "Academic upload failed"), processingState: { step: "error", progress: 0, error } } : e,
      ),
    }));
    toast.error(`Upload failed`, { description: error, position: "top-center" });
  }, []);

  const handleDataUpdate = useCallback((documentId: string, data: ExtractedAcademicData) => {
    editGeneration.current++;
    setDirtyDraft(true);
    setNotesReviewed(false);
    setSlotEntries((prev) => {
      const next = { ...prev };
      for (const s of SLOT_KEYS) {
        next[s] = prev[s].map((e) =>
          e.uploaded?.documentId === documentId
            ? { ...e, uploaded: { ...e.uploaded, extractedData: data } }
            : e,
        );
      }
      return next;
    });
  }, []);

  const saveDraft = async () => {
    if (!sessionId || savingDraft || scanning) return;
    const generation = editGeneration.current;
    setSavingDraft(true);
    if (!pendingUpload) setDraftError(null);
    const patch = async (body: unknown) => {
      const response = await fetch(`/api/sessions/${sessionId}/intake`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Could not save the draft. Retry saving before approval.");
      }
      return response.json() as Promise<{ revision: number }>;
    };
    try {
      for (const doc of uploadedDocs) {
        if (doc.evidenceState && doc.evidenceState !== "provided") continue;
        const saved = await patch({ documentId: doc.documentId, revision: doc.revision, data: doc.extractedData });
        setSlotEntries((prev) => Object.fromEntries(SLOT_KEYS.map((slot) => [slot, prev[slot].map((entry) =>
          entry.uploaded?.documentId === doc.documentId ? { ...entry, uploaded: { ...entry.uploaded, revision: saved.revision } } : entry)])) as SlotEntriesMap);
      }
      const saved = await patch({ revision: notesRevision.current, notes: sectionHtml });
      notesRevision.current = saved.revision;
      const current = await fetch(`/api/sessions/${sessionId}/intake`, { cache: "no-store" });
      if (!current.ok) throw new Error("Could not verify the saved draft. Retry saving before approval.");
      profileVersion.current = ((await current.json()) as IntakeDraft).profileVersion;
      if (editGeneration.current === generation) setDirtyDraft(false);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Draft save failed. Retry saving.");
    } finally { setSavingDraft(false); }
  };

  const handleApprove = async () => {
    if (!sessionId || !processingConfirmed || !notesReviewed || !requiredNotesFilled(sectionHtml) || dirtyDraft || savingDraft || scanning || draftError || pendingUpload) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notesReviewed,
          counselorNotes: {
            careerGoal: sectionHtml.careerGoal,
            interests: sectionHtml.interests,
            financial: sectionHtml.financial,
            concerns: sectionHtml.concerns,
            impression: sectionHtml.impression,
          },
          profileVersion: profileVersion.current,
          notesRevision: notesRevision.current,
          documents: uploadedDocs.map((doc) => ({ id: doc.documentId, revision: doc.revision })),
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Approval failed");
      }
      if (!terminationStarted.current) router.push(`/analysis?session=${sessionId}`);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Approval failed. Reload before retrying.");
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
        <a className="mt-4 inline-block underline" href="/input">Return to saved drafts</a>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 sm:px-6 relative animate-fade-in">
      {sessionId && <SessionTerminationControl sessionId={sessionId} open={terminationOpen} onOpenChange={setTerminationOpen}
        label="Cancel session" onTerminating={() => { terminationStarted.current = true; setTerminating(true); }} />}
      <div hidden={terminating}>
      <div className="relative left-1/2 mb-6 w-[calc(100vw-2rem)] max-w-6xl -translate-x-1/2">
        <SessionProgressIndicator className="max-w-none px-0 sm:px-6" sessionId={sessionId} fallbackStep="upload" confirming={requiredNotesFilled(sectionHtml) && !dirtyDraft && !savingDraft && !scanning} />
      </div>

      <div className="mb-6 flex items-start gap-3">
      <details className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-cream-light/50 p-4 text-sm leading-relaxed text-muted-text [&_p]:mt-3">
        <summary className="cursor-pointer font-semibold">How this counselor workflow works</summary>
        <p>1. Intake: type the two required note fields or extract a photograph. Academic documents and the other three note fields are optional. Undecided is a valid career goal.</p>
        <p>2. Confirm Information: review and save notes, academic values and missing evidence, then approve the exact inputs.</p>
        <p>3. Analysis: AI assists with advisory suggestions; unavailable evidence and partial failures remain visible.</p>
        <p>4. Review Report: check the summary, limitations and sources. Approve the exact report version before 5. Download.</p>
        <p>Drafts expire 24 hours after creation; PDFs have their own fixed deadline. Sign in as the same counselor to resume eligible work. End Session revokes access and shows cleanup status. Downloaded copies follow school policy.</p>
      </details>
      <ProcessingNotice confirmed={processingConfirmed} onConfirm={setProcessingConfirmed} />
      </div>
      <fieldset disabled={savingDraft || isSubmitting} className="min-w-0 space-y-6">
        {/* Part 1: Counselor Notes */}
        <section aria-labelledby="counselor-notes-heading" className="rounded-2xl border border-black/[0.08] bg-cream-light p-5 shadow-card sm:p-8">
          <div className="flex items-start gap-3 mb-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage">
              <FileText size={20} />
            </div>
            <div>
              <h2 id="counselor-notes-heading" className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink leading-snug">
                Counselor Notes
                <span className="inline-block align-middle rounded-full bg-sage px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Required
                </span>
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-text">
                Type your interview summary or upload a clear photograph of your prepared notes.
              </p>
            </div>
          </div>

          <IngestionFreshnessPanel />

          <div className="mb-5 rounded-xl border border-sage/20 overflow-hidden">
            <button
              type="button"
              aria-expanded={guideOpen}
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
            <TabsList tabIndex={-1} className="w-full h-auto p-1 rounded-xl bg-cream-dark/80 border border-black/[0.06] mb-4">
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
              <fieldset disabled={!processingConfirmed}>
              {!processingConfirmed && <p className="mb-3 text-sm">Read and confirm the processing notice before uploading.</p>}
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
                  role="button"
                  aria-label="Upload photo of your notes"
                  aria-disabled={!processingConfirmed}
                  tabIndex={processingConfirmed ? 0 : -1}
                  onKeyDown={event => {
                    if (processingConfirmed && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault(); document.getElementById("notes-file-input")?.click();
                    }
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
                    accept="image/jpeg,image/png,image/webp"
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
                            : "Extracted & ready to edit · Photograph released"}
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
                      disabled={scanning}
                      aria-label="Remove notes photograph"
                      onClick={() => handleNotesSelect(null)}
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
                        {scanError} Select a clearer photograph to retry, or switch to typed notes.
                      </div>
                    )}
                    {imageSectionsReady && <SessionNotesForm value={imageSectionHtml} onChange={updateImageNotes} />}
                  </div>
                </>
              )}
              </fieldset>
            </TabsContent>

            <TabsContent value="manual" className="mt-0">
              <EditableFieldForm value={manualSectionHtml} onChange={updateManualNotes} />
            </TabsContent>
          </Tabs>
        </section>

        {/* Part 2: DocumentUploadPanel */}
        <section aria-label="Supporting documents" className="rounded-2xl border border-black/[0.08] bg-cream-light shadow-card">
        {sessionId && processingConfirmed ? (
          <DocumentUploadPanel
            sessionId={sessionId}
            slots={{
              1: {
                files: slotEntries[1].map((e) => e.file),
                docType: slotTypes[1],
                perFileProcessing: slotEntries[1].map((e) => e.processingState),
                uploaded: slotEntries[1][0]?.uploaded ?? null,
              },
              2: {
                files: slotEntries[2].map((e) => e.file),
                docType: slotTypes[2],
                perFileProcessing: slotEntries[2].map((e) => e.processingState),
                uploaded: slotEntries[2][0]?.uploaded ?? null,
              },
              3: {
                files: slotEntries[3].map((e) => e.file),
                docType: slotTypes[3],
                perFileProcessing: slotEntries[3].map((e) => e.processingState),
                uploaded: slotEntries[3][0]?.uploaded ?? null,
              },
            }}
            disabled={dirtyDraft || scanning}
            onSlotFilesAdd={handleSlotFilesAdd}
            onSlotFileRemove={handleSlotFileRemove}
            onSlotTypeChange={handleSlotTypeChange}
            onDocumentUploaded={handleDocumentUploaded}
            onUploadError={handleUploadError}
          />
        ) : (
          <div className="p-6 sm:p-8 flex items-center gap-2 text-muted-text text-[13px]">
            {sessionId ? "Read and confirm the processing notice to enable optional academic uploads." : <><Loader2 size={16} className="animate-spin" /> Initializing session…</>}
          </div>
        )}

        {/* Part 2.5: ExtractionResultsPanel */}
        {uploadedDocs.length > 0 && (
          <div className="px-5 pb-5 sm:px-8 sm:pb-8">
            <ExtractionResultsPanel documents={uploadedDocs} onDataUpdate={handleDataUpdate} />
          </div>
        )}
        </section>

        <section aria-labelledby="confirm-information-heading" className="overflow-hidden rounded-2xl border border-sage/20 bg-cream-light shadow-card">
          <div className="p-5 sm:p-8">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage"><ClipboardCheck size={20} aria-hidden="true" /></span>
              <div>
                <h2 id="confirm-information-heading" className="text-base font-semibold text-ink">Confirm Information</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-text">Check your notes and academic evidence before starting analysis.</p>
              </div>
            </div>
            <h3 className="mb-3 text-xs font-medium text-muted-text">Academic evidence</h3>
            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
              {["ncae", "form_137", "nat"].map((type) => {
                const doc = uploadedDocs.find((document) => document.docType === type);
                const usable = doc && (!doc.evidenceState || doc.evidenceState === "provided");
                return <div key={type} className="rounded-xl border border-black/[0.08] bg-cream/40 p-3 sm:p-4">
                  <dt className="text-xs font-semibold text-ink sm:text-sm">{type === "form_137" ? "Form 137" : type.toUpperCase()}</dt>
                  <dd className={`mt-2 flex items-center gap-1.5 text-xs ${usable ? "text-forest" : "text-muted-text"}`}>
                    {usable && <Check size={13} className="shrink-0" aria-hidden="true" />}
                    {doc ? usable ? "Provided" : "No usable scores" : "Not provided"}
                  </dd>
                </div>;
              })}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-text">Missing academic evidence is allowed. Recommendations will reflect these gaps.</p>
            {notesSource && <details className="mt-4 text-xs text-muted-text"><summary className="cursor-pointer font-medium">Notes extraction source</summary><p className="mt-2 break-all">Notes source: {String(notesSource.documentId ?? "unavailable")} · Page {String(notesSource.page ?? "unavailable")} · Review needed</p></details>}
          </div>
          <div className="mx-5 mb-5 rounded-xl border border-black/[0.08] bg-cream/50 p-4 sm:mx-8 sm:mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div role="status" className="flex items-start gap-2.5 text-sm">
                {savingDraft ? <Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-sage" /> : draftError ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-soft" /> : <Save size={17} className="mt-0.5 shrink-0 text-sage" />}
                <div>
                  <p className="font-medium text-ink">{savingDraft ? "Saving draft…" : draftError ? "Draft needs attention" : dirtyDraft ? "Unsaved changes" : "Draft saved"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-text">{dirtyDraft ? "Save before approval or another upload." : "Review the values above before approval."}</p>
                </div>
              </div>
          <button type="button" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-sage/25 bg-cream-light px-4 py-2 text-xs font-semibold text-forest transition-colors hover:bg-sage/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!sessionId || savingDraft || scanning || (!dirtyDraft && !draftError)} onClick={saveDraft}>
            {draftError ? "Retry saving draft" : "Save draft"}
          </button>
            </div>
            {draftError && <p role="alert" className="mt-3 border-t border-red-soft/15 pt-3 text-xs leading-relaxed text-red-soft">{draftError}</p>}
          </div>

        {/* Part 3: ConfirmationApprovalBar */}
        {sessionId && processingConfirmed && (
          <ConfirmationApprovalBar
            documentsReady={!dirtyDraft && !savingDraft && !scanning && !draftError && !pendingUpload && SLOT_KEYS.every((slot) => slotEntries[slot].every((entry) => entry.processingState.step === "complete"))}
            readinessMessage={dirtyDraft ? "Save your changes before approving inputs." : savingDraft ? "Wait for your draft to finish saving." : draftError ? "Resolve the draft issue above before approval." : undefined}
            notes={sectionHtml}
            notesReviewed={notesReviewed}
            onNotesReviewedChange={setNotesReviewed}
            isSubmitting={isSubmitting}
            onApprove={handleApprove}
          />
        )}
        </section>

      </fieldset>
      <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); switchOrigin.current?.focus(); }}>
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
      </div>
    </section>
  );
}
