import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [375, 768, 1280])
  test(`report comparison, keyboard access and WCAG AA at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/report-preview");
    const summary = page.getByRole("region", { name: "Student summary" });
    await expect(summary.getByRole("meter")).toHaveCount(3);
    const reasons = summary
      .getByText("Why this option?", { exact: true })
      .first();
    await reasons.focus();
    await page.keyboard.press("Enter");
    await expect(
      summary.getByText("Supported by reviewed academic records.").first(),
    ).toBeVisible();
    const second = page.getByRole("button", {
      name: /Rank 2.*BS Information Systems/,
    });
    await second.focus();
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-pressed", "true");
    const detail = page.getByRole("region", {
      name: "Selected recommendation",
    });
    await expect(
      detail.getByRole("heading", { name: "BS Information Systems" }),
    ).toBeVisible();
    const meaning = detail.getByRole("region", { name: "What this means" });
    await expect(meaning.getByText(/^82\.00\s*\/\s*100$/)).toBeVisible();
    await expect(
      meaning.getByText("Based on Form 137 subjects Mathematics."),
    ).toBeVisible();
    const citation = detail
      .getByRole("link", { name: "Source 1: Labor market outlook 2026" })
      .first();
    await citation.click();
    const source = page.locator('[id$="-source-0"]');
    await expect(source).toBeInViewport();
    await source.getByText("Source details", { exact: true }).click();
    await expect(
      source.getByText("operator curated pdf", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`report-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Review & release" }).click();
    const review = page.getByRole("region", { name: "Counselor review" });
    await expect(
      review.getByRole("group", { name: "Release this report" }),
    ).toBeVisible();
    await expect(
      review.getByRole("group", { name: "Revise this report" }),
    ).toBeVisible();
    await expect(
      review.getByRole("group", { name: "Reject this version" }),
    ).toBeVisible();
    await review.screenshot({
      path: info.outputPath(`review-actions-${width}.png`),
    });
    await page.getByRole("button", { name: "Approve report v2" }).click();
    await expect(
      page.getByRole("button", { name: "Download PDF" }),
    ).toBeVisible();
  });

for (const scenario of ["partial", "long", "expired"])
  test(`${scenario} report remains readable on mobile`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/report-preview?scenario=${scenario}`);
    if (scenario === "partial") {
      const partial = page.getByRole("button", {
        name: /Partial comparison.*Technical training/,
      });
      await partial.click();
      await expect(partial.getByRole("meter")).toHaveCount(0);
      await expect(
        page.getByText(
          "No supported comparison is available for this dimension.",
        ),
      ).toBeVisible();
      const evidence = page.getByRole("region", { name: "Academic evidence" });
      await expect(evidence.getByRole("listitem")).toHaveCount(3);
      await expect(
        evidence.getByText("Unreadable", { exact: true }),
      ).toBeVisible();
      await expect(
        evidence.getByText("Unsupported", { exact: true }),
      ).toBeVisible();
    }
    if (scenario === "expired") {
      await expect(page.getByRole("status")).toContainText(
        "This report has expired",
      );
      await expect(
        page.getByRole("button", { name: "Approve report v2" }),
      ).toBeDisabled();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`report-${scenario}.png`),
      fullPage: true,
    });
  });
