# Implementation and validation record — 2026-11-16

## Outcome and limits

The local GitHub-queue → Windows bridge → real Chromium → local evidence → sanitized GitHub result cycle was demonstrated successfully. A new task was created through the connected GitHub tool, detected by the bridge, validated, executed against aiKit, reported, closed, and retrieved through the GitHub tool. This validates the queue/browser infrastructure from this Codex session. Configuration and execution from the user's ordinary ChatGPT surface still need validation there; an Actions schema and instructions are provided. No OpenAI API integration is involved.

The broader 99-item QA assignment is **not complete**. Full official workflows have no approved deterministic mutation/generation drivers. Their scenario definitions and source/status histories are preserved locally. Creating/editing/publishing/deleting test objects, token-consuming operations, upload/download end-to-end quality, voice consent, cross-tool handoffs and real-device checks still require scoped authorization and scenario-specific execution. Six live descriptions remain truncated. A smoke PASS is not an official item PASS.

## Verified execution

| Check | Actual result |
|---|---|
| Node / npm / Playwright / TypeScript | Node 24.22.2, npm 11.19.1, Playwright 1.65.0, TypeScript 5.9.3; installed Chromium launched successfully |
| Windows permission helper | Synthetic file remained readable after protection under PowerShell 7 and Windows PowerShell 5.1; final startup verified protected local storage |
| TypeScript | `npm run check:types` passed for BEQSON and the separate aiKit suite |
| Bridge self-tests | 20 passed: validation/injection rejection, exclusive/stale locks, restart/closure recovery, lost-response deduplication, interrupted execution, remote receipts, pause/stop monitoring, bounded output/timeout, corrupt checkpoint, expiring approval, official evidence review, standalone review hold, and pending-only public resume |
| Public source checks | Publishable-file/secret-pattern scan and ignore-rule verification passed; private auth/evidence excluded |
| GitHub Actions self-tests | First draft-PR run `43884816119` completed successfully on Ubuntu; local Windows validation remains separate |
| Successful queue task | Private [issue #3](https://github.com/Bequcho/beqson-qa-platform/issues/3), run `c3f25b55-6a50-4145-8e0f-7e63d1583b95`: real English homepage scenario PASS, local screenshot/trace, sanitized result retrieved, task closed |
| Restart/no duplicate | Private tasks #1, #3, #4, #5, #6 remained closed with one original result receipt each after restart; #1 additionally has an explicit correction comment |
| Unsupported command | Private [issue #6](https://github.com/Bequcho/beqson-qa-platform/issues/6): EXEC/code payload REJECTED without browser execution |
| Protected project page | Run `7036baa8-d62b-4c36-bc3b-0f5e676bfb7c`: AUTH_SMOKE PASS, all write methods blocked |
| Language preference | Fresh signed-out Haitian Creole → English → reload reproduction verified English remained selected; local JSON/screenshots/trace |
| Broad public suite | Run `f9d6176e-97f3-4d25-ab63-cc925d615098`: 45 PASS, 1 FAIL, 38 NOT TESTED out of 84 registered checks; stopped at first failure |
| Approved public continuation | Private tasks #9, #11 and #13 executed pending cases only. Final combined coverage: **81 PASS / 3 FAIL / 0 BLOCKED / 0 NOT TESTED** across all 84 unique cases. Task #13's final batch passed all 25 cases; combined sanitized coverage was posted and retrieved |
| Confirmed product issue | Independent reproductions confirmed the same 9,999 px RTL horizontal overflow and blank viewport on Hebrew, Arabic and Punjabi. These are three failing checks linked to one finding, with separate evidence; no matching report in the saved sections of the nine current program cards |
| Official source reconciliation | All 9 cards / 99 positions read and aligned; 15 live checkmarks retained as observations; six descriptions still truncated; zero official dispositions changed |

The broad public coverage is not a green suite: three RTL failures remain. The user approved continuation after reviewing the original Hebrew finding. Arabic and Punjabi were reproduced and linked to that same reviewed defect; each failure remains recorded. The continuation completed all previously untested cases and left testing unpaused. Original stopped-run counts remain preserved in the table above. Combined reports are local `public-coverage.json` and `public-coverage.md`, with sanitized coverage on private issue #13. Individual runs and their exact evidence remain under `.aikit-local/`; none is committed here. The self-test CI job does not run product workflows or authenticate to aiKit.

## Confirmed product observation

On the public Hebrew, Arabic and Punjabi homepages at a 375 px client width, the document measured 10,374 px wide: 9,999 px of excess horizontal space. Independent Chromium contexts reproduced horizontal scrolling to -5,000 px, placing the main content entirely outside the viewport. Screenshots showed a blank viewport. The off-screen `.v3-skip` link is positioned at `left: -9999px` on these RTL pages. The single local English report is `bugs/BUG-a3766477d66b.txt`, with per-locale reproduction evidence under `rtl-reproduction/`. Its original Hebrew-only version is preserved. No report was submitted to aiKit.

Duplicate review covered report sections on all nine current program cards; it was not a global search of every customer's reports. Official Languages item 5 retains its prior disposition and references this local finding.

## Corrected implementation defects

- Original bridge lacked cross-process exclusion, graceful termination, bounded logs, durable interruption reporting and recovery of a result whose issue closure failed.
- GitHub result publication could repeat after a crash between posting and saving. New publication checks the deterministic remote receipt before retrying.
- Original smoke code assumed selector values equal URL prefixes. Read-only verification established `pt-BR → /pt` and `zh-Hans → /zh`. Actual header links use lowercase `/pa-arab` and `/zh-hant` prefixes; those are now used consistently for navigation assertions.
- Approved public continuation uses a validated local checkpoint to select only NOT TESTED cases. Prior passes and known failures are preserved. The mobile menu now uses its observed `aria-controls` relationship, with a localized-name fallback, so Swedish and Greek labels do not cause avoidable skips.
- Initial new-run debugging found unexecuted Playwright cases counted as FAIL, an overly early locale-selector lookup/hydration race, and tracing cleanup that obscured the auth result. These were corrected, covered by result-mapping tests or real reruns, and the original evidence retained.
- The first ACL implementation removed access without establishing a usable grant. Access was restored with a fresh access-only security descriptor; the replacement helper verifies permissions and was exercised under both PowerShell versions.
- Private issue #1 originally received incorrect counts during that debugging. A separate correction records 2 PASS / 0 FAIL / 1 BLOCKED / 17 NOT TESTED. Its original report remains available for audit; no aiKit defect was claimed from that run.

## Progress interpretation

Historical private issue #2: 3 PASS / 3 FAIL / 0 BLOCKED / 93 NOT TESTED. The current program has 15 checkmarks across its 99 steps. Those are different evidence types, not interchangeable QA totals. The source importer preserves both, including all existing/new local histories. Newly reviewed official outcomes remain unrecorded; the system does not reset historical results or promote them to current verified passes. The current verified smoke results and confirmed RTL finding are tracked separately.

## Exact source files

Modified:

```text
.github/workflows/aikit-public.yml
package.json
aikit/README.md
aikit/qa.mjs
aikit/bridge/README.md
aikit/bridge/START-BRIDGE.cmd
aikit/bridge/LOGIN-AIKIT.cmd
aikit/bridge/setup-auth.mjs
aikit/bridge/auth-smoke.mjs
aikit/bridge/watch.mjs
```

Created:

```text
.github/workflows/aikit-bridge-checks.yml
aikit/CHATGPT.md
aikit/IMPLEMENTATION.md
aikit/chatgpt-actions.openapi.json
aikit/playwright.config.ts
aikit/tsconfig.json
aikit/routes.json
aikit/bridge/bootstrap.mjs
aikit/bridge/check-public.mjs
aikit/bridge/command.mjs
aikit/bridge/protect-storage.ps1
aikit/bridge/record-result.mjs
aikit/bridge/sync-program.mjs
aikit/lib/authorization.mjs
aikit/lib/budget.mjs
aikit/lib/checklist.mjs
aikit/lib/config.mjs
aikit/lib/github.mjs
aikit/lib/process.mjs
aikit/lib/protocol.mjs
aikit/lib/resume.mjs
aikit/lib/report.mjs
aikit/lib/review.mjs
aikit/lib/runner.mjs
aikit/lib/storage.mjs
aikit/lib/sync-program.mjs
aikit/lib/worker.mjs
aikit/tests/auth.spec.ts
aikit/tests/fixtures.ts
aikit/tests/public.spec.ts
aikit/tests/utilities.ts
aikit/unit/bridge.test.mjs
```

Private generated files are excluded, including the complete 99-scenario matrix, source snapshots, reports, login state, local review draft and traces. Existing BEQSON test files and root Playwright configuration were not modified. Nothing was merged into main.
