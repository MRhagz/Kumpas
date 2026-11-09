# Review Report presentation audit

Audience: counselors reviewing AI-assisted career comparisons with students.

## Issues identified

1. Review actions and procedural prose precede the results and dominate the page.
2. Student options, explanations, caveats and next steps form a wall of text; comparisons require scrolling and recall.
3. Alignment totals repeat across the summary, selection cards and detail header without visual comparison.
4. Academic availability repeats in available/missing lists, completeness prose and raw document statuses.
5. Unreadable and unsupported uploads are visually conflated with absent records.
6. Interpretation repeats the same evidence in reasoning, key signals and claim references; justified text impedes scanning.
7. Citation URLs, chunk identifiers, ingestion timestamps and acquisition enum values clutter the reading surface.
8. Strengths, concerns and neutral signals lack clear grouping; generated key signals duplicate evidence claims.
9. Approval, rejection, input correction and regeneration lack an action hierarchy or review sequence.
10. Version, approval, PDF origin and expiry are scattered; expiry is explained too far down the page.
11. There are no section shortcuts and recommendation buttons do not expose selection programmatically.
12. Long titles, references and narrow viewports need explicit layout checks.
13. Partial-analysis messages use internal specialist names and repeat missing-evidence warnings.
14. Fallback subtitles can imply supporting data that is unavailable.
15. Source-currency terminology needs translation into plain language.
16. The download button blends into its dark card, and a temporarily disabled download incorrectly uses the expired-link label.
17. Rejected reports still display draft/download-approval instructions in the download card.
18. Mobile selection needs a way to jump to updated evidence; fragment targets and the academic sidebar need clearance from the sticky header, and disclosures need larger touch targets.

## Resulting interface

- Results appear first, followed by counselor evidence and review/release controls, with section shortcuts between them.
- Student-safe option cards have aligned score bars, expandable evidence, visible lowest-component considerations and numbered next steps. Redundant “Discuss this trade-off” text is removed.
- Ranked-path scores remain prominent. Component scores are separate from their explanations, using smaller green text and thinner green bars.
- Each academic document has one status row: provided, not provided, unreadable or unsupported. Additional coverage context remains expandable.
- Three dimension cards replace duplicated reasoning/key-signal prose. Unique observations are grouped as supporting factors, concerns or other observations.
- Numbered source-title links connect findings to references. Publication dates remain visible; provenance expands on demand. Source warnings use plain language.
- Approval is the primary green action, preview is secondary, revision actions share their own group, and rejection has a separate red action row.
- Draft, approved, rejected, expired and temporarily disabled states have accurate guidance. The approved download button has a full-width, high-contrast treatment.
- Live selection announcements, explicit detail/comparison/review links, keyboard-focusable targets, header clearance and larger disclosures improve navigation.

## Scope and compatibility

Scoring, generation, approval/version identity and PDF content are retained. Evidence claims additionally expose existing component points as an optional numeric field for visualization. Older projections without numeric metadata retain an evidence-text fallback. Stored student summaries keep their existing sentence-based contract; the two known score-statement formats are split for browser presentation, and other wording is retained.

The browser report is reorganized; the stored PDF remains the exact document the counselor previews and approves. No schema migrations or deployment changes are required.

## PR validation

- Full access/contract suite: 811 tests passed across 60 files.
- Application suite: 28 tests passed across two files.
- Release metrics: four tests passed; the live-contract script passed its syntax check.
- Chrome: all ten browser scenarios passed, covering 375/768/1280 px report interactions, partial/long/expired mobile reports, rejected-state recovery and intake-to-download keyboard workflows.
- Draft, approved-download and rejected-state accessibility scans found zero WCAG AA violations.
- TypeScript, production build and whitespace checks passed. Repository-wide lint passed with 12 pre-existing unused-variable warnings outside this branch's changes.
- Partial-specialist assertions check counselor-facing labels and the visible missing-record checklist.
- Desktop/mobile screenshots were inspected using synthetic reports. Browser artifacts remain in the ignored `test-results/` directory; CI also runs Edge, Firefox and WebKit checks.

## Assessment

No further major layout change is indicated by this review. Observing counselors use representative reports in actual sessions remains the most useful next validation, especially comparing paths and locating missing evidence.
