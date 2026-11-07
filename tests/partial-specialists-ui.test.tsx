// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import LoadingScreen from "@/components/analysis/loading-screen";
import ReportDownloadView from "@/components/analysis/report-download-view";
import type { SpecialistStatus } from "@/lib/module3/types";
import type { ReportGenerationResponse } from "@/lib/report/types";

const agentStatuses: SpecialistStatus[] = [
  { agent: "AcademicAuditor", status: "SUCCESS", unavailableEvidence: [] },
  { agent: "IndustryAnalyst", status: "FAILED", unavailableEvidence: [] },
  { agent: "FeasibilityStrategist", status: "UNAVAILABLE", unavailableEvidence: ["No public cost evidence"] },
];
afterEach(cleanup);

it("shows actual specialist outcomes while preparing a partial report", () => {
  render(<LoadingScreen completedStages={["documentParsing", "notesParsing", "transcriptionLayer", "feasibility", "synthesis"]} agentStatuses={agentStatuses} />);
  expect(screen.getByRole("heading", { name: "Partial Analysis Available" })).toBeTruthy();
  expect(screen.getByText("AcademicAuditor: Complete")).toBeTruthy();
  expect(screen.getByText("IndustryAnalyst: Failed")).toBeTruthy();
  expect(screen.getByText("FeasibilityStrategist: Unavailable")).toBeTruthy();
  expect(screen.queryByText("Analysis Complete")).toBeNull();
});

it("keeps partial suggestions, failed specialists and missing academic evidence visible on report review", () => {
  const report: ReportGenerationResponse = {
    sessionId: "synthetic", reportVersion: 1, downloadUrl: null, expiresAt: "2099-01-01T00:00:00Z",
    generatedAt: "2026-11-07T00:00:00Z", byteLength: 1234, recommendationCount: 1, agentStatuses,
    academicEvidence: { availableDocuments: [], missingDocuments: ["form137", "ncae", "nat"], completenessNote: "No academic documents were provided." },
    recommendations: [{ id: "partial", rank: null, careerPath: "Supported suggestion", alignmentScore: null,
      incompleteReason: "Unscored partial comparison: missing demand, feasibility.", reasoningSummary: "Based on approved career interests.",
      keySignals: ["Approved career interest"], keySignalDetails: [] }],
  };
  render(<ReportDownloadView report={report} onNewSession={() => {}} />);
  const warning = screen.getByRole("status");
  expect(within(warning).getByRole("heading", { name: "Partial specialist analysis" })).toBeTruthy();
  expect(within(warning).getByText("IndustryAnalyst: Failed")).toBeTruthy();
  expect(within(warning).getByText("FeasibilityStrategist: Unavailable")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Unscored partial comparisons" })).toBeTruthy();
  expect(screen.getByText("No academic documents were provided.")).toBeTruthy();
  expect(screen.queryByText("Rank 1")).toBeNull();
});

it("does not call an unscored result complete even when every specialist responded", () => {
  render(<LoadingScreen completedStages={["synthesis"]} isPartial agentStatuses={agentStatuses.map((s) => ({ ...s, status: "SUCCESS" }))} />);
  expect(screen.getByRole("heading", { name: "Partial Analysis Available" })).toBeTruthy();
  expect(screen.queryByText("Analysis Complete")).toBeNull();
});
