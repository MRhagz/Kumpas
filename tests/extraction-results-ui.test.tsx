// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExtractionResultsPanel from "@/components/input/extraction-results-panel";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
import type { UploadedDocument } from "@/types";

afterEach(cleanup);

function document(type: "ncae" | "nat" | "form_137"): UploadedDocument {
  const data = normalizeAcademicData(type, type === "form_137"
    ? { subjects: [{ name: "Mathematics", grade: 85, grade_level: "Grade 10", year: "2025" }] }
    : type === "nat" ? { subjects: { Science: 91 }, composite_score: 91 }
      : { strand_scores: { Science: 85 }, overall_percentile: 85 });
  return { documentId: type, slotIndex: 1, docType: type, extractedData: data,
    originalExtractedData: structuredClone(data), redactedImageUrl: null, evidenceState: "provided",
    provenance: { documentId: type, model: "gemini-3.8-flash", promptVersion: "sw06-v1", page: null } };
}

it("adds and removes document tabs, keeps edits, and shows one document at a time with keyboard navigation", async () => {
  const update = vi.fn();
  const ncae = document("ncae"), nat = document("nat"), form = document("form_137");
  const { rerender } = render(<ExtractionResultsPanel documents={[]} onDataUpdate={update} />);
  expect(screen.queryByRole("tablist")).toBeNull();
  rerender(<ExtractionResultsPanel documents={[ncae]} onDataUpdate={update} />);
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Overall percentile" }), { target: { value: "93" } });
  expect(update).toHaveBeenCalledWith("ncae", expect.objectContaining({ type: "ncae" }));
  const edited = { ...ncae, extractedData: update.mock.calls[0][1] };
  rerender(<ExtractionResultsPanel documents={[edited, nat, form]} onDataUpdate={update} />);
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  expect((screen.getByRole("spinbutton", { name: "Overall percentile" }) as HTMLInputElement).value).toBe("93");
  expect(screen.queryByRole("spinbutton", { name: "NAT composite" })).toBeNull();
  await userEvent.click(screen.getByRole("tab", { name: "NAT" }));
  expect((screen.getByRole("spinbutton", { name: "NAT composite" }) as HTMLInputElement).value).toBe("91");
  expect(screen.queryByRole("spinbutton", { name: "Overall percentile" })).toBeNull();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Form 137" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("spinbutton", { name: "Mathematics · Grade 10 · 2025" })).toBeTruthy();
  rerender(<ExtractionResultsPanel documents={[edited, nat]} onDataUpdate={update} />);
  expect(screen.getByRole("tab", { name: "NCAE" }).getAttribute("aria-selected")).toBe("true");
  expect((screen.getByRole("spinbutton", { name: "Overall percentile" }) as HTMLInputElement).value).toBe("93");
  expect(screen.getByText("Corrected")).toBeTruthy();
  rerender(<ExtractionResultsPanel documents={[nat]} onDataUpdate={update} />);
  expect(screen.getByRole("tab", { name: "NAT" }).getAttribute("aria-selected")).toBe("true");
  rerender(<ExtractionResultsPanel documents={[]} onDataUpdate={update} />);
  expect(screen.queryByRole("tablist")).toBeNull();
});

it("keeps extraction details collapsed and announces field status without repeating internal field paths", async () => {
  const { container } = render(<ExtractionResultsPanel documents={[document("ncae")]} onDataUpdate={vi.fn()} />);
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  await userEvent.click(screen.getByText("Extraction details"));
  expect(details.open).toBe(true);
  expect(screen.getByText(/Source document: ncae/)).toBeTruthy();
  expect(screen.queryByText(/Field:/)).toBeNull();
  const field = screen.getByRole("spinbutton", { name: "Overall percentile" });
  expect(container.querySelector(`[id="${field.getAttribute("aria-describedby")}"]`)?.textContent).toBe("Extracted");
});
