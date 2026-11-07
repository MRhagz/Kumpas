"use client";

import type { SpecialistStatus } from "@/lib/module3/types";
import { Loader2 } from "lucide-react";

export default function LoadingScreen({ completedStages, agentStatuses, isPartial = false }: {
  completedStages: string[]; agentStatuses?: SpecialistStatus[]; isPartial?: boolean;
}) {
  const partial = isPartial || agentStatuses?.some(s => s.status !== "SUCCESS");
  const analyzed = completedStages.includes("synthesis");
  return <section aria-live="polite" aria-busy="true" className="mx-auto max-w-3xl space-y-5 px-6 py-12">
    <Loader2 className="animate-spin" aria-hidden="true" />
    <h1 className="text-2xl font-semibold">{partial ? "Partial Analysis Available" : analyzed ? "Preparing draft report" : "Analyzing approved inputs"}</h1>
    <p>{analyzed ? "Analysis returned. The private PDF must finish before report review opens."
      : "The specialists are using your approved notes and available academic evidence. Missing documents stay unavailable; no upload is required."}</p>
    <p>Extraction and counselor confirmation happen during intake. This step does not extract documents again.</p>
    {agentStatuses && <ul>{agentStatuses.map(s => <li key={s.agent}>{s.agent}: {s.status === "SUCCESS" ? "Complete" : s.status === "FAILED" ? "Failed" : "Unavailable"}</li>)}</ul>}
    {partial && <p role="status">Partial analysis: some evidence or specialist results are unavailable. Missing dimensions remain unscored.</p>}
    <p>You may return to correct inputs or End Session. Saved changes require approval and new analysis. If interrupted, sign in as the same counselor and resume the unexpired draft.</p>
  </section>;
}
