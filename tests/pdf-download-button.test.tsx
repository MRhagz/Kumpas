// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PdfDownloadButton from "@/components/analysis/pdf-download-button";

afterEach(cleanup);

it("distinguishes an unavailable action from an expired link", () => {
  const view = render(
    <PdfDownloadButton
      downloadUrl="/report.pdf"
      fileName="report.pdf"
      disabled
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByText("Link Expired")).toBeNull();
  view.rerender(
    <PdfDownloadButton
      downloadUrl="/report.pdf"
      fileName="report.pdf"
      expired
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Link Expired" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
