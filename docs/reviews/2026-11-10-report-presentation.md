# Review Report presentation audit

Audience: counselors reviewing AI-assisted career comparisons with students.

## Issues identified before implementation

1. Review actions and procedural prose precede the results and dominate the page.
2. Student options, explanations, caveats and next steps form a wall of text; comparisons require scrolling and recall.
3. Alignment totals repeat across the summary, selection cards and detail header without visual comparison.
4. Academic availability repeats in available/missing lists, completeness prose and raw document statuses.
5. Unreadable and unsupported uploads are visually conflated with absent records.
6. Interpretation repeats the same evidence in reasoning, key signals and claim references; justified text impedes scanning.
7. Citation URLs, chunk identifiers, ingestion timestamps and acquisition enum values clutter the reading surface.
8. Strengths, concerns and neutral signals lack clear grouping; current generated key signals duplicate evidence claims.
9. Approval, rejection, input correction and regeneration lack an action hierarchy or review sequence.
10. Version, approval, PDF origin and expiry are scattered; expiry is explained too far down the page.
11. There are no section shortcuts and recommendation buttons do not expose selection programmatically.
12. Long titles, references and narrow viewports need explicit layout checks.
13. Partial-analysis messages use internal specialist names and repeat missing-evidence warnings.
14. Fallback subtitles can imply supporting data that is unavailable.

## Changes

- Results first, section shortcuts and a compact version/status header; review and release follow the evidence.
- Student-safe option cards with aligned score bars, expandable evidence, visible trade-offs and numbered next steps.
- Counselor option selection stays separate from the student-safe projection and exposes its selected state.
- One row per academic document, with provided, not provided, unreadable and unsupported statuses. An expandable coverage note retains the original context.
- Three evidence dimension cards with component score bars replace duplicated reasoning and key-signal text. Unique signals are grouped by meaning.
- Numbered source title links replace URL walls; publication date remains visible, provenance expands on demand.
- Explicit unscored states, safe source-link handling, source-currency caveat, expired-state notice and existing review/download locks retained.

## Scope and validation

Presentation changes retain report generation, student-safe wording, scoring, approval/version identity and PDF bytes. Evidence claims additionally expose their existing component points as an optional numeric field, allowing score bars without parsing narrative text. Older projections without this field still show their evidence text. The browser report is reorganized; the existing PDF remains the exact document the counselor previews and approves. PDF visual redesign is a separate follow-up because it changes a stored, versioned artifact.

Validate recommendation selection, missing scores, legacy report fallback, academic status precedence, source navigation, provenance disclosure, review transitions, responsive layout, keyboard access and WCAG 2.1 AA scans using synthetic fixtures.

## Verification results

- Initial validation: 105 focused tests passed across report presentation, review transitions, student-safe/PDF content, evidence summaries, score consistency, processing and delivery.
- After transferring the branch and rebasing onto the latest main, 112 tests across nine suites passed, including analysis versioning and workflow navigation; TypeScript and whitespace checks passed again.
- Eight Chrome browser checks passed: 375/768/1280 px report interactions, partial/long/expired mobile reports and the existing 375/1280 px keyboard workflow through approval, download and session termination.
- Report accessibility scans found zero WCAG 2.1 AA violations in the tested states.
- TypeScript, targeted ESLint, whitespace checks and the Next.js production build passed.
- Screenshots were inspected for desktop/mobile spacing and score alignment. Browser artifacts are in the ignored `test-results/` directory.

## Git workspace

The original checkout initially protected `.git` as read-only, so the first commit was prepared in `/tmp/kumpas-report-review`. After the session permissions were updated, the branch was transferred into the original repository. Local `main` was fast-forwarded to `origin/main` at `f5f37a7`, and `feat/counselor-report-presentation` was rebased onto it without conflicts. All 14 transferred files were verified against the prepared commit before removing the temporary transfer stash. No remote changes were pushed.
