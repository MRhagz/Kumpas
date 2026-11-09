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
    within(detail).getAllByText(
      "Aptitude comparison 82/100 uses reviewed academic records.",
    ),
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
