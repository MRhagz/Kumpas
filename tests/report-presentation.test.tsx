// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import ReportDownloadView from "@/components/analysis/report-download-view";
import { reportFixture } from "./fixtures/report-presentation";

afterEach(cleanup);
const mount = (scenario = "complete") =>
  render(
    <ReportDownloadView
      report={reportFixture(scenario)}
      onNewSession={() => {}}
      onReview={vi.fn()}
    />,
  );

it("compares options visually and exposes selection without copying counselor detail into the student summary", () => {
  mount();
  const summary = screen.getByRole("region", { name: "Student summary" });
  expect(within(summary).getAllByRole("meter")).toHaveLength(3);
  expect(summary.textContent).not.toContain("Training costs");
  const option = screen.getByRole("button", {
    name: /Rank 2.*BS Information Systems/,
  });
  fireEvent.click(option);
  expect(option.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByText("Showing evidence for BS Information Systems.")
      .getAttribute("aria-live"),
  ).toBe("polite");
  expect(
    screen
      .getByRole("link", { name: "View selected path details" })
      .getAttribute("href"),
  ).toBe("#selected-recommendation");
  expect(
    within(
      screen.getByRole("region", { name: "Selected recommendation" }),
    ).getByRole("heading", { name: "BS Information Systems" }),
  ).toBeTruthy();
});

it("uses one status row per record, distinguishing absent, unreadable and unsupported evidence", () => {
  mount("partial");
  const academic = screen.getByRole("region", { name: "Academic evidence" });
  const rows = within(academic).getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual([
    "Form 137Not provided",
    "NCAEUnreadable",
    "NATUnsupported",
  ]);
  expect(academic.textContent).toContain("0 of 3");
});

it("shows missing scores as unscored and does not invent a meter or dimension evidence", () => {
  mount("partial");
  const option = screen.getByRole("button", {
    name: /Partial comparison.*Technical training/,
  });
  expect(within(option).queryByRole("meter")).toBeNull();
  fireEvent.click(option);
  const detail = screen.getByRole("region", {
    name: "Selected recommendation",
  });
  expect(within(detail).getAllByRole("meter")).toHaveLength(2);
  expect(detail.textContent).toContain(
    "No supported comparison is available for this dimension.",
  );
  expect(detail.textContent).toContain("No total or rank is assigned.");
});

it("renders a claim once, links it to a numbered source and keeps provenance behind disclosure", () => {
  mount();
  const detail = screen.getByRole("region", {
    name: "Selected recommendation",
  });
  expect(
    within(detail).getAllByText("Based on Form 137 subjects Mathematics."),
  ).toHaveLength(1);
  const citation = within(detail).getAllByRole("link", {
    name: "Source 1: Labor market outlook 2026",
  })[0];
  const target = document.getElementById(
    citation.getAttribute("href")!.slice(1),
  );
  expect(target?.textContent).toContain("Labor market outlook 2026");
  const links = within(detail).getAllByRole("link");
  expect(
    links.some((link) =>
      /^(javascript:|file:)/.test(link.getAttribute("href") ?? ""),
    ),
  ).toBe(false);
  expect(
    within(detail).getByText("manual curation").closest("details")?.open,
  ).toBe(false);
});

it("makes expiry visible at the top and blocks review and PDF access", () => {
  mount("expired");
  expect(screen.getByRole("status").textContent).toContain(
    "This report has expired.",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Approve report v2",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.queryByRole("link", { name: "Preview Draft PDF" })).toBeNull();
});

it("preserves the summary-unavailable and legacy-explanation fallback", () => {
  const report = reportFixture();
  report.studentSummary = null;
  delete report.recommendations[0].evidenceClaims;
  render(<ReportDownloadView report={report} onNewSession={() => {}} />);
  expect(
    screen.getByText(/Student summary unavailable for this stored PDF/),
  ).toBeTruthy();
  expect(
    screen.getByText(report.recommendations[0].reasoningSummary),
  ).toBeTruthy();
});

it("separates component scores from evidence explanations", () => {
  mount();
  const meaning = screen.getByRole("region", { name: "What this means" });
  for (const [label, score] of [
    ["Aptitude fit", "82.00"],
    ["Work opportunities", "90.00"],
    ["Practical requirements", "72.00"],
  ]) {
    const card = within(meaning)
      .getByRole("heading", { name: label })
      .closest("article")!;
    expect(within(card).getByText(score)).toBeTruthy();
    expect(within(card).getByRole("meter").getAttribute("aria-valuenow")).toBe(
      String(Number(score)),
    );
    expect(
      Array.from(card.querySelectorAll("p"))
        .filter((p) => p.textContent?.startsWith("Based on"))
        .every((p) => !p.textContent?.includes("/100")),
    ).toBe(true);
  }
  expect(meaning.textContent).not.toContain("comparison 82/100");
});

it("separates student reason and trade-off values while preserving explanatory context", () => {
  const report = reportFixture("partial");
  report.studentSummary!.options[0].reasons[0] =
    "Aptitude comparison: 0.00 out of 100, supported by self-reported interests (not measured academic performance).";
  render(<ReportDownloadView report={report} onNewSession={() => {}} />);
  const first = within(
    screen.getByRole("region", { name: "Student summary" }),
  ).getAllByRole("article")[0];
  expect(within(first).getByText("0.00")).toBeTruthy();
  expect(
    within(first).getByText(
      "Supported by self-reported interests (not measured academic performance).",
    ),
  ).toBeTruthy();
  expect(
    within(first).getByText("Lowest component: practical requirements"),
  ).toBeTruthy();
  expect(within(first).getAllByText("72.00")).toHaveLength(2);
  expect(first.textContent).not.toContain("out of 100, supported by");
});

it("groups release, revision and rejection actions separately", () => {
  mount();
  const release = screen.getByRole("group", { name: "Release this report" });
  expect(
    within(release).getByRole("button", { name: "Approve report v2" }),
  ).toBeTruthy();
  expect(
    within(release).getByRole("link", { name: "Preview Draft PDF" }),
  ).toBeTruthy();
  const revise = screen.getByRole("group", { name: "Revise this report" });
  expect(
    within(revise)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Correct Inputs", "Regenerate report"]);
  expect(
    within(
      screen.getByRole("group", { name: "Reject this version" }),
    ).getByRole("button", { name: "Reject report" }),
  ).toBeTruthy();
});

it("explains that a rejected version needs a new draft in the download panel", () => {
  const report = {
    ...reportFixture(),
    reviewStatus: "rejected" as const,
    previewUrl: null,
  };
  render(
    <ReportDownloadView
      report={report}
      onNewSession={() => {}}
      onReview={vi.fn()}
    />,
  );
  const download = screen.getByRole("region", { name: "Report download" });
  expect(within(download).getByText("Rejected report")).toBeTruthy();
  expect(
    within(download).getByRole("heading", { name: "Create a new draft" }),
  ).toBeTruthy();
  expect(download.textContent).not.toContain("Draft report");
  expect(download.textContent).not.toContain(
    "after this report version is approved",
  );
  expect(
    screen.queryByRole("button", { name: "Approve report v2" }),
  ).toBeNull();
});
