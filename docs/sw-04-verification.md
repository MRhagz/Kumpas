# SW-04: notes contract and processing notice

Baseline: `8eae99156d68a190ae78dc494fb68abd52b73c2a` on current main.
Read the approved linked SRS (scope, Modules 2.1–2.2 and security/reliability),
SDD (intake, SessionNotesForm and confirmation), STD F04/F05/S01/S02,
RTM KMP-FR-003/022/023/029, and MVP findings before implementation.

Only Career Goal and Personal Interests and Strengths are required. Undecided
is valid. Blank optional fields remain blank; omitted optional fields normalize
to empty strings. Both client and server reject required fields containing only
markup, whitespace, non-breaking spaces or zero-width editor characters.
Typed and photographed notes use the same five-field form. Notes-only intake
does not require academic uploads or call Gemini extraction.

The notice appears before uploads. Counselors acknowledge it before uploading
and separately confirm review of the exact editable notes before approval.
Editing notes or switching input method revokes the latter confirmation.
Approval requires JSON `notesReviewed: true`; photographed-note extraction
requires multipart `notesReviewed=true`. Missing/false confirmation returns 400
before profile persistence or external extraction, respectively.

## Configuration and deployment

- No database migration or new runtime dependency. Deploy the UI and API changes
  together: older API clients without the new confirmation receive HTTP 400.
- Set `NEXT_PUBLIC_SCHOOL_PRIVACY_CONTACT` to the approved school contact in the
  build environment and rebuild. Until supplied, the UI refers to the school's
  designated privacy contact without inventing a name or address.
- The school contact and approved deployment data-handling record were unavailable.
  The notice distinguishes the approved handling policy from deployment verification.
  STD F05 comparison against that record remains unverified and must precede real-record use.
- This PR does not implement image redaction (SW-05), durable recovery, expiry,
  deletion/backup enforcement, or provider configuration. In particular, the existing
  photographed-note route still transmits the submitted image to Gemini after review.
  Counselor attestation does not replace SW-05's required application-side redaction.
  The notice does not claim automatic redaction of typed notes.
- The test runner adds development dependencies and uses Node 24, matching the new
  GitHub Actions job. The lockfile also prunes stale LangChain entries already absent
  from main's package.json. No analysis functionality is removed.
- No submission PDFs changed; no production deployment or database write performed.

## Verification

Executed locally on Windows with Node `v24.15.0` and npm `11.12.1`:

| Exact command | Outcome |
| --- | --- |
| `npm ci` | Passed for the original baseline and again for the final lockfile (826 packages installed). Final audit reports 39 findings, including two critical findings in existing dependency paths; no audit fixes bundled into SW-04. |
| `npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom` | Failed peer resolution against main's Node 20 typings; no forced resolution used. |
| `npm install --save-dev vitest@3 @testing-library/react @testing-library/user-event jsdom@26` | Installed, subsequently replaced the vulnerable older runner. |
| `npm install --save-dev vitest@5 @types/node@24` | Passed; final runner is Vitest 5.1.0. |
| `npm test` | 28 passed across two suites. |
| `npx tsc --noEmit` | Passed with final Node 24 typings and test configuration. |
| `npm run lint` | Failed: 8 existing errors and 16 warnings in main's code. |
| `npx eslint src/components/input/processing-notice.tsx src/lib/notes-validation.ts test/notes-api.test.ts test/notes-client.test.tsx vitest.config.mts` | Passed. |
| `git diff --check` | Passed. |
| `npm run build` | Sandbox attempt failed fetching existing Google Fonts. Network-enabled retry compiled and finished TypeScript, then failed collecting page data because `supabaseUrl` is not configured in the isolated checkout. |

Baseline lint comparison used main's original changed files under
`.tmp/sw04-baseline/src`, then ran
`npx eslint .tmp/sw04-baseline/src --no-ignore --format json --output-file .tmp/baseline-lint.json`
and `npx eslint src test vitest.config.mts --format json --output-file .tmp/sw04-lint.json`.
The four `react-hooks/static-components` errors in the touched WysiwygField toolbar
also occur in main. All other changed/new source and test files had no lint diagnostics.
No existing lint rules were disabled.

Tests exercise each optional field independently blank, all optional fields omitted,
each required field absent/blank/markup-only, undecided goals and supported formatting,
server authentication/ownership, review rejection before processing, and mocked
photograph extraction. The full rendered intake tests exercise both Grade 10 track
selection and SHS higher-education/workforce notes, remove a synthetic confidential
marker, invalidate review after edits, and assert that only session creation and
approval requests occur. Academic and backend services are mocked; these tests do
not establish live redaction, storage policy, recommendation quality, report review
or complete STD S01/S02 acceptance.

Live provider, authenticated deployment, production build with approved credentials,
the eight academic-document combinations, five cases per education stage, and school
policy comparison were not run. Human review and passing required CI checks are
still required before merge; the tracker must remain In review until then.
