"use client";

import Image from "next/image";
import { BarChart3, Check, CircleHelp, GraduationCap, ShieldCheck, TriangleAlert } from "lucide-react";
import type { SpecialistStatus } from "@/lib/module3/types";
import styles from "@/styles/loading.module.css";

const SPECIALISTS = [
  { agent: "IndustryAnalyst", stage: "laborMarket", label: "Labor", icon: BarChart3 },
  { agent: "AcademicAuditor", stage: "feasibility", label: "Academic", icon: GraduationCap },
  { agent: "FeasibilityStrategist", stage: "jobDemand", label: "Feasibility", icon: ShieldCheck },
] as const;

export default function LoadingScreen({ completedStages, agentStatuses, isPartial = false }: {
  completedStages: string[]; agentStatuses?: SpecialistStatus[]; isPartial?: boolean;
}) {
  const partial = isPartial || agentStatuses?.some(s => s.status !== "SUCCESS");
  const analyzed = completedStages.includes("synthesis");
  // Three specialist stages, synthesis, then report generation. Never infer progress from elapsed time.
  const finishedStages = SPECIALISTS.filter(s =>
    completedStages.includes(s.stage) || agentStatuses?.some(status => status.agent === s.agent)
  ).length + Number(analyzed);
  const progress = finishedStages * 20;
  const heading = partial ? "Partial Analysis Available" : analyzed ? "Preparing draft report" : "Agents at work…";
  const message = analyzed
    ? "Bringing your findings together in a private report…"
    : finishedStages > 0 ? "Cross-correlating agent findings…" : "Reviewing your approved notes and academic evidence…";

  return (
    <section className={styles.screen} aria-labelledby="analysis-loading-heading">
      <div className={styles.content}>
        <div className={styles.orbit}>
          <span className={styles.outerRing} aria-hidden="true" />
          <span className={styles.middleRing} aria-hidden="true" />
          <span className={styles.innerRing} aria-hidden="true" />
          <div className={styles.logo}>
            <Image src="/kumpas-logo.png" alt="Kumpas" width={32} height={32} />
          </div>
        </div>

        <div role="status" aria-live="polite" aria-atomic="true">
          <h1 id="analysis-loading-heading" className={styles.heading}>{heading}</h1>
          <p className={styles.message}>{message}</p>
        </div>

        <div className={styles.progress}>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Analysis and report preparation"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={finishedStages > 0 ? progress : undefined}
            aria-valuetext={finishedStages > 0 ? `${finishedStages} of 5 stages complete. Preparing your report.` : "Analysis in progress"}
          >
            <div className={finishedStages > 0 ? styles.fill : styles.indeterminate} style={finishedStages > 0 ? { width: `${progress}%` } : undefined} />
          </div>
          <p className={styles.progressLabel}>
            {finishedStages > 0 ? `${progress}% of stages complete` : "Analysis in progress"}
          </p>
        </div>

        <ul className={styles.badges} aria-label="Analysis specialists">
          {SPECIALISTS.map(({ agent, stage, label, icon: Icon }) => {
            const status = agentStatuses?.find(s => s.agent === agent)?.status;
            const done = status === "SUCCESS" || (!status && completedStages.includes(stage));
            const outcome = done ? "Complete" : status === "FAILED" ? "Failed" : status === "UNAVAILABLE" ? "Unavailable" : "Working";
            const StatusIcon = done ? Check : status === "FAILED" ? TriangleAlert : status === "UNAVAILABLE" ? CircleHelp : null;
            return (
              <li key={agent} className={styles.badge} data-outcome={outcome} title={`${agent}: ${outcome}`}>
                <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                <span>{label}</span>
                {StatusIcon ? <StatusIcon size={12} aria-hidden="true" /> : <span className={styles.activityDot} aria-hidden="true" />}
                <span className="sr-only">: {outcome}</span>
              </li>
            );
          })}
        </ul>

        {partial && (
          <p className={styles.partial} role="status">
            Partial analysis: some evidence or specialist results are unavailable. Missing dimensions remain unscored.
          </p>
        )}

        <details className={styles.details}>
          <summary>Analysis details</summary>
          <div className={styles.detailsBody}>
            <p>The specialists are using your approved notes and available academic evidence. Missing documents stay unavailable; no upload is required.</p>
            <p>Extraction and counselor confirmation happen during intake. This step does not extract documents again.</p>
            {agentStatuses && <ul>{agentStatuses.map(s => <li key={s.agent}>{s.agent}: {s.status === "SUCCESS" ? "Complete" : s.status === "FAILED" ? "Failed" : "Unavailable"}</li>)}</ul>}
            <p>The private PDF must finish before report review opens.</p>
            <p>You may return to correct inputs or End Session. Saved changes require approval and new analysis. If interrupted, sign in as the same counselor and resume the unexpired draft.</p>
          </div>
        </details>
      </div>
    </section>
  );
}
