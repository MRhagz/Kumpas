# Kumpas report presentation

The system presents supported career comparisons to counselors and students. Human report review passes.

## Interface

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

## Verification

- Full access/contract suite: 804 tests passed across 60 files.
- Application suite: 28 tests passed across two files.
- Release metrics: four tests passed; the live-contract script passed its syntax check.
- Chrome: all ten browser scenarios passed, covering 375/768/1280 px report interactions, partial/long/expired mobile reports, rejected-state recovery and intake-to-download keyboard workflows.
- Draft, approved-download and rejected-state accessibility scans found zero WCAG AA violations.
- TypeScript, production build and whitespace checks passed. Repository-wide lint passed with 16 warnings.
- Partial-specialist assertions check counselor-facing labels and the visible missing-record checklist.
- Desktop/mobile screenshots were inspected using synthetic reports. Browser artifacts remain in the ignored `test-results/` directory; CI also runs Edge, Firefox and WebKit checks.
