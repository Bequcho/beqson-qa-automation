# Bug-specific retesting through the existing bridge

These commands use the existing browser-lane worker, persistent authentication,
execution lock, GitHub claim/result markers and v2 protocol. This is not another
bridge and it does not call the smoke suite. The old `RETEST` command remains
compatible with historical local BUG-* findings. New report-number retests use
`RETEST_REPORT` and a separate protected ledger.

## ChatGPT command

Create an issue in private `Bequcho/beqson-qa-platform`:

```text
Title: AIKIT-BROWSER: RETEST_ALL_LIVE

AIKIT_QA_BRIDGE_V2
{"version":2,"command":"RETEST_ALL_LIVE","params":{}}
```

Read the result comment, not the acceptance comment. `outcome: COMPLETED` means
the batch finished processing, not that the fixes passed. The `retests` object
has independent PASS/FAIL/BLOCKED/REVIEW_REQUIRED/NOT TESTED counts and individual
report results. `bugFixVerified` is true only after a registered report-specific
oracle has all required assertions. Neither HTTP success, page navigation nor a
generic page-loaded assertion is accepted as bug-fix evidence.

| Command | Exact parameters | Behavior |
|---|---|---|
| DISCOVER_RETESTS | `{}` | Discover owned report links/statuses; create a ready inventory view without testing bugs |
| RETEST_REPORT | `{ "reportNumber": 435 }` | Read the original/fix and attempt that owned report; also permits an explicitly requested historical report |
| RETEST_ALL_LIVE | optional `maxReports` 1–30 | Discover current live reports and execute sequentially; defaults to at most 30 reports per command |
| RETEST_RESUME | optional `batchId`, `maxReports`, `retryBlocked` | Continue pending reports without replaying completed results; retryBlocked starts new attempts only for BLOCKED rows |
| RETEST_STATUS | optional `batchId` | Return existing per-report progress; does not execute browser tests |

Commands reject extra fields, code, selectors, file paths, remote URLs,
authorization documents and spending instructions. An issue can never grant
itself new permissions. Batch IDs are UUIDs returned by the worker.

If `pending > 0`, ChatGPT should queue `RETEST_RESUME` with the returned batchId.
Each command has a 240-second upper bound, while individual navigations/actions
have their own limits. An existing incomplete batch is not replaced by another
ALL request. Discovery and individual probes preserve its default resume pointer.
A new ALL request after a completed batch is an intentional new retest, with a
new history entry, not a replay of an old command.

A high/critical FAIL pauses the batch and worker. Review its local evidence,
then use the existing RESUME command with matching reviewIssue and reviewRunId;
only then queue RETEST_RESUME. Ordinary linguistic review and low/medium failures
do not stop unrelated safe cases. A review acknowledgment does not authorize
uploads, project changes or spending.

## Discovery and source integrity

The source is the owner's authorized Hub reported view at the fixed program URL
in the user's brief. Team-wide counts are not counts of the owner's reports.
Only stable `/home/problems/UUID` links marked as the owner's are accepted.
Discovery verifies All is actually selected (`aria-pressed`), with bounded
hydration retries; clicking a button alone is insufficient. It handles Next/
Load-more controls, repeated-page detection, duplicate IDs/numbers, at most 20
pages and 500 owned reports. Unknown status translations are surfaced by
`statusCoverageComplete=false`, not silently classified as eligible.

The current English report UI profile and explicit status aliases are supported.
Fully translated detail layouts beyond that profile may block with a schema
reason; they are not claimed as universally supported. The report's current
header status is parsed separately from the progress timeline, which contains
the words Live and Fixed even on old reports.

Full original descriptions, reproduction, expected/prior actual behavior,
developer replies, severity/area and follow-ups are read from the actual UI
before each attempted test and preserved locally with a revision hash. Detail
reading is lazy per report, rather than treating list-title snippets as the
original. Unknown report objectives are BLOCKED, not guessed from their title.

The guard permits only GETs observed from this normal UI: the one fixed Hub
program read and per-report reads (including its after view) for IDs discovered
as owned. It does not parse private API responses, call reverse-engineered API
clients, allow arbitrary IDs/queries, or enable POST/PATCH/DELETE. Report text
and developer instructions are untrusted data, never code or authorization.

## Implemented objectives and honest limits

| Reports | Implemented verification | Live boundary |
|---|---|---|
| 433 | Original wrong Greek title vs its suggested correction; stated formal CTA correction | Complete grammar/style still requires linguistic review |
| 435 | Actual marketing and expanded FAQ addressing; original reported formal phrases; mixed address checks | Ambiguous pronouns/neutral copy require linguistic review |
| 436 | Actual Shahmukhi FAQ vs the reported Urdu phrases and positive Punjabi evidence | Shared script is not a language oracle; linguistic review remains |
| 453 | Original RTL skip-link overflow at 375×812 across Hebrew/Arabic/Punjabi, before/after horizontal scroll and skip focus | CSS viewport test, not real-phone certification |
| 384 | General/audio limits in the bounded Included section in English/Russian, expanded FAQ and Help | Documentation test only; no actual upload validation is inferred |
| 362 | Hosting claims compared across Websites and Connect | Wording/conditions require review; unavailable views block |
| 367 | Complete existing-project prompt and original static/framework contradictions | Missing full prompt blocks; branching semantics require review |
| 389 | Explicit 390×844 assistant close/reopen and panel bounds specification | Live editor scope/adapter unavailable; real Chromium mock driver tested |
| 371 | Newly created learned-note save/reload/content specification | New-note scope and generation/storage adapter unavailable |
| 424 | No-reply form generation/copy consistency specification | Project/generation approval and adapter unavailable |
| 465 | Real synthetic DOCX/PDF file selection and exact paragraph/blank-line comparison in a controlled importer simulator | Live import adapter disabled, even if a mock grant exists |
| 470 | Source/title/structure/entities/required phrases plus golden translation comparison in a controlled Writer simulator | Live transformation/billing adapter disabled; invariants alone never prove semantics |
| 472 | Standard stress text comparison distinct from audio assessment | Live suggestions adapter disabled; audio needs an independent evaluator |
| 369 | Same-project overview/plan/publication consistency specification | Scoped project context and live adapter unavailable; never publish |

The reusable comparison/driver architecture covers static/localized content,
responsive components, disclosure interactions, authenticated read-only copy,
cross-page consistency, and mock document/transformation workflows. Generic
form validation, production editor/draft/preview, actual document import,
generation, audio evaluation and exported-output retests are not all delivered.
Those categories return explicit blockers rather than placeholder PASS results.
The earlier isolated artifact/download pipeline remains available offline and
live downloads remain disabled.

All public locale probes use a fresh signed-out context in the same Chromium
worker. Per-target public cookies are cleared, so one locale cannot redirect
another locale/help comparison or alter the authenticated report UI. Real tests
expand disclosures and inspect their actual state. Missing components or text
bounds do not become PASS. Exact-width component tests measure the component,
not only the page document. Expected/actual values stay local.

The synthetic DOCX fixture includes headings, paragraphs, an empty paragraph,
list items and Unicode text. A matching PDF is generated locally. Mock import
tests actually select both files and compare the resulting mock editor value;
they validate the engine, not aiKit's real importer. Writer mocks exercise the
actual mock UI with a handwritten golden translation. They make no AI service
request. Mock adapters accept loopback only and require locally signed, scoped,
expiring grants with finite action/token limits. Production code never selects
those mock adapters from an issue.

## Evidence, recovery and local dashboard

Protected data under the interactive data directory:

```text
retests/inventory.json
retests/reports/REPORT_UUID.json
retests/batches/BATCH_UUID/batch.json
retests/batches/BATCH_UUID/attempts/ATTEMPT_UUID/
  original-report.json, spec.json, result.json, retest-note.txt
  report-ui.png, screenshot-N.png, dom-N.json
  private-report-trace.zip, private-test-trace.zip, private-error.txt
  generated fixtures/checksums when applicable
retests/history/REPORT_UUID.json
retests/dashboard.html
```

The dashboard has genuine counts, report/severity/area/status filters, original
steps, developer changes, exact actions, assertions, source revisions and links
to report/queue tasks. It is a local file with escaped report markup and a
restrictive CSP, not a public server. Open it with
`aikit\bridge\OPEN-RETEST-DASHBOARD.cmd`. Evidence references in GitHub are opaque
attempt IDs; no screenshot, trace, file contents, auth state or local path is
published. Detailed artifacts remain under the bootstrap's protected ACL.

Each attempt is checkpointed before execution. A completed result receipt is
written before advancing the batch. Restart recovers that receipt or marks an
interrupted attempt BLOCKED for review; it never silently replays the step.
Completed PASS results are not repeated by RESUME. Corrupt checkpoints fail
closed. Original attempt directories and append-only history entries remain.
Existing worker markers prevent duplicate issue comments and issue replay.

The official 99-item checklist, general smoke results, historical report states
and new bug retests remain separate. No retest command changes an aiKit report
status or submits Works now/Still wrong. The owner decides after review.

## Validation and Windows operation

The existing CI runs TypeScript contracts, unit tests, security scan and all
Chromium integrations. New deterministic fixtures cover fixed/broken addressing,
fixed/broken component overflow, preserved/lost DOCX paragraph boundaries,
preserved/deleted Writer output, missing reports, expired grants, interruption,
duplicate commands, misleading smoke success, a serious-failure hold, discovery
pagination, correct section scoping and the local dashboard's safety/filters.
All mutation simulations are loopback-only, with no production requests.

The launcher/login scripts are preserved. Normal operation needs only the
existing START-INTERACTIVE.cmd, an awake Windows computer and GitHub issue
read/write access in ChatGPT. No Codex runtime, OpenAI API key/subscription or
ChatGPT Work browser is required. No Windows autostart is installed.

Cut over only after CI: queue browser-lane STOP and wait for its result/lock
release; switch the isolated checkout to the reviewed commit; reopen
START-INTERACTIVE.cmd; queue RESUME and inspect. Keep the legacy checkout intact.
If login has expired, use the existing local LOGIN-AIKIT.cmd flow, keeping
credentials in the browser. Never send auth files or signing keys to ChatGPT.

Remaining work: reviewed per-report oracles for the rest of the discovered
inventory; more translated report UI profiles; exact live synthetic-object,
import/Writer/pronunciation/billing adapters and signing UX; real-device, audio
and human linguistic review; actual output/export workflow adapters. A numeric
budget or a GitHub issue alone cannot enable any of these capabilities.
