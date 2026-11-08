# SW-26 browser and accessibility verification

SW-31 follow-up, 8 November 2026: the legacy axe aggregation workaround also
crashed on the macOS CI runner, including one unchanged retry. The current runner
uses axe's default aggregation, retaining the fresh Firefox process per audit,
zero-frame assertion and all WCAG rules. The older compatibility-mode results
below are historical. Current candidate results and exceptions are recorded in
`docs/sw-31-verification.md`; no prior crash is reclassified as a passing run.

Prerequisite SW-25 is merged in base `4b0f9cc`. The supplied SRS accessibility
section targets WCAG 2.1 AA; STD S08 requires keyboard/focus/contrast/status
checks and explicit exceptions. RTM NFR-014/015 reader/usability studies remain
human release-verification activities. No source documents or submission PDFs
are edited; later document reconciliation retains the SW-05 extraction decision.

## Reproduce

```
npm ci
npx playwright install firefox webkit
npx playwright test --project=edge --project=firefox --project=webkit-engine
npx playwright install chrome
npx playwright test --project=chrome
npm run test:access -- --maxWorkers=2
npx tsc --noEmit
```

On Windows a workspace-local engine cache can be selected with
`PLAYWRIGHT_BROWSERS_PATH`; installed Edge/Chrome channels use their normal
locations. The CI matrix provisions Chrome, Edge and WebKit on Linux, and Firefox
on Windows. The Linux Firefox page crashes inside axe on the report scan even
with legacy frame mode; that failed run is retained as an explicit platform
limitation. Windows runs the same keyboard assertions and axe rules in separate
invocations per width, avoiding repeated scan injection across viewport tests.
Artifacts retain browser versions, axe JSON and screenshots for 14 days.

The Vite fixture imports real intake/analysis/report components and application
CSS. Only Next navigation, the authentication header and API responses are
isolated. It uses synthetic data, a system fallback font and no real provider,
authentication, private storage or student records. It is outside the Next app
routes and is not a deployed bypass. This checks rendered components rather
than hosted infrastructure. Do not use real student data in these fixtures.

At 375x900 and 1280x900, tests use Tab/Shift+Tab, Space, Enter and Escape to
reach notices/editors, choose an invalid upload through the native file picker,
read its alert, open/cancel termination and verify restored focus, approve inputs,
review a non-empty long-label recommendation/student summary, trigger an actual synthetic PDF download, and confirm End Session with focus on pending-cleanup status.
They assert visible focus, five named stages with textual state, zero horizontal
page overflow and zero axe WCAG 2.1 A/AA violations at intake/review/download.
Axe JSON also records incomplete checks; automated checks do not establish full
WCAG conformance or replace a spoken screen-reader evaluation.

## Observed local coverage (Windows, 7 November 2026)

| Browser | Observed result |
| --- | --- |
| Edge 156.0.4314.58 | Both viewport workflows pass; all three scans per workflow have 0 violations and 0 incomplete results. |
| Firefox 159.0, Playwright build | Initial default axe aggregation crashed at download and was not counted as passing. The documented axe legacy frame-testing mode avoids opening its aggregation page; the fixture asserts zero frames. Both viewport workflows pass using that documented compatibility mode; all scans have 0 violations and 0 incomplete results. |
| WebKit 27.2, Playwright engine | Both viewport workflows pass; all three scans per workflow have 0 violations and 0 incomplete results. Supplemental engine coverage, **not Safari**. |
| Chrome | Not installed locally; launch checks failed. Linux CI is recorded separately in the PR. |
| Safari 15+ | Not available on this Windows host; no Safari run claimed. Actual Safari/macOS or iOS remains required release verification. |

Early fixture attempts needed a public-config stub and stable Next navigation
adapter. Browser measurements exposed the Tab-consuming editor, unlabeled
selectors/format buttons, missing dialog return focus, a Firefox tab-list loop
and the report warning contrast failure. These were corrected. Optional semantic
snapshot collection also crashed Firefox and was removed; the final runner uses isolated audit pages and Firefox-only axe legacy mode. No axe rules are disabled; a zero-frame assertion prevents untested cross-origin frames. Measurements wait for the intake fade-in to settle. The keyboard-flow page is not modified by axe instrumentation. The initial local and Linux aggregation crashes remain recorded in the PR.

Not executed: real NVDA/Narrator/VoiceOver spoken-announcement tests, every
historical minimum browser version, five-student comprehension assessment or
five-counselor unassisted workflow study. Those are not counted as passing.
The scoped unit tests verify natural editor Tab exit, named keyboard formatting
and >=4.5:1 text-token contrast against white/cream; browser axe checks cover
actual rendered combinations. The global focus fallback supports browsers without
`:focus-visible`; motion is reduced when requested.

## Deployment

No schema, data migration, credentials or new runtime environment values.
Adds dev-only Playwright/axe/Vite tooling and a PR-only browser workflow.
Contrast tokens, focus styles, labels, keyboard handlers and dialog focus change
in the application; existing Grade 10/SHS, extraction, approval, owner access,
report release and cleanup contracts remain. No local redaction is added.
