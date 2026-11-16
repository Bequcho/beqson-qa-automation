# Interactive controller validation — 2026-11-16

## Delivered scope

A working persistent authenticated read-only browser controller, with BROWSER_OPEN, BROWSER_INSPECT, BROWSER_ACT, BROWSER_BATCH and BROWSER_RESET, plus the existing pause/resume/stop controls. The implementation uses generated element/option IDs, retained element handles, explicit target validation, a local step journal, a conservative privacy projection and a fail-closed network/action policy. There are no 99 tool-specific drivers.

The candidate is isolated from the working legacy bridge in its own checkout, protected storage and `AIKIT-BROWSER:` issue lane. It is based on the PR #2 branch. PR #2 and the separate Voice Kit probe in PR #3 are not merged or edited by this work.

## Actual real-site demonstration

All commands were created through the connected GitHub tool and executed by the local candidate Windows worker. Sanitized result comments were retrieved through GitHub.

| Private queue task | Verified result |
|---|---|
| [#21 BROWSER_OPEN](https://github.com/Bequcho/beqson-qa-platform/issues/21) | Loaded the protected aiKit projects page with the seeded local QA session; actual heading `Things you build` observed |
| [#22 BROWSER_INSPECT](https://github.com/Bequcho/beqson-qa-platform/issues/22) | Returned current generated IDs and a visible, enabled, unambiguous Help disclosure; expanded=false |
| [#23 BROWSER_ACT](https://github.com/Bequcho/beqson-qa-platform/issues/23) | Clicked that returned element ID, captured the new state, and verified expanded=true. The same browser session ID was retained across OPEN/INSPECT/ACT |
| [#24 BROWSER_BATCH](https://github.com/Bequcho/beqson-qa-platform/issues/24) | Three sequential Help toggles, three actual expanded-state assertions passed; state captured after each step |
| #25 STOP, #26 RESUME, [#27 INSPECT](https://github.com/Bequcho/beqson-qa-platform/issues/27) | Browser worker stopped/restarted; auth and protected projects route restored, a new session ID issued, original receipts retained |
| [#28 BROWSER_OPEN](https://github.com/Bequcho/beqson-qa-platform/issues/28) | Opened Voice Kit through the generic command and linked partial observation to official.voice-kit.02; officialItemsAutoCompleted=0 |
| [#31 BROWSER_RESET](https://github.com/Bequcho/beqson-qa-platform/issues/31) | Reset the active page/history to the allowed origin homepage and issued a new session ID |
| [#32 BROWSER_OPEN](https://github.com/Bequcho/beqson-qa-platform/issues/32) | Protected projects page still opened after reset with the `Things you build` heading |
| [#33 BROWSER_ACT](https://github.com/Bequcho/beqson-qa-platform/issues/33) | Final-policy worker clicked the freshly returned Help ID and verified expanded=true |

These are UI/action/assertion observations, not official checklist completion or proof that every tool workflow works. No generation, purchase, message, publishing, deletion or account change was initiated. Browser HTTP writes and generation routes were blocked. Full screenshots/traces/actual DOM evidence remained in the candidate's protected local storage; only bounded sanitized observations were posted.

## Automated checks actually run

- **38 unit/self-tests passed**, including the 31 existing bridge/startup tests and seven browser validation/privacy/authorization/journal tests.
- **6 Chromium integration tests passed** against a local synthetic HTTP fixture: full browser round trip; stable/ambiguous/stale targets; structural batch rejection before execution; explicit assertions and stop behavior; click/fill/press/select/scroll/Back/element inspection; sensitive/destructive action blocking; write/generation network blocking; auth persistence across restart; interrupted/completed operation idempotency; reset; and partial checklist evidence without status changes.
- Existing and browser-contract TypeScript checks passed.
- Source/secret-pattern/ignore-rule security checks and whitespace checks passed.
- The PR workflow was extended to install Chromium and run the synthetic browser integration suite. CI results are reported separately from local validation; it does not load private aiKit auth or production QA evidence.

## Preservation and remaining limitations

The original auth state, official checklist, completed public coverage JSON/Markdown and known-issue history were SHA-256 compared with a baseline and were unchanged. The old Windows worker continued polling throughout validation. The completed 84 language checks were not rerun. Screenshots/traces and checkpoint files from previous QA work were not moved/deleted.

The current release supports read-only interactions and narrowly granted local-only form editing. There is no server-mutation or paid-generation adapter; spending limits alone cannot enable one. Unknown API reads are blocked unless locally reviewed/allowlisted, and unknown UI text is masked. Some tool actions therefore remain BLOCKED. Upload workflows, persistent writes, spending-controlled generation, arbitrary iframes and remote visual access require additional separately reviewed capability work. They are not claimed as delivered.

Ordinary ChatGPT operation requires a connected tool capable of creating/reading private GitHub issues, or the provided Actions schema configured in that user's ChatGPT account. The compatible GitHub command/result chain was demonstrated in this session; account-side ChatGPT setup is not silently configured. No external AI/browser API credits or Work-mode runtime were added.

## Exact changed files relative to PR #2

Modified:

```text
.github/workflows/aikit-bridge-checks.yml
package.json
aikit/README.md
aikit/bridge/watch.mjs
aikit/lib/budget.mjs
aikit/lib/protocol.mjs
aikit/lib/report.mjs
aikit/lib/runner.mjs
aikit/lib/worker.mjs
aikit/tsconfig.json
```

Added:

```text
aikit/INTERACTIVE.md
aikit/INTERACTIVE-VALIDATION.md
aikit/chatgpt-browser.openapi.json
aikit/bridge/START-INTERACTIVE.cmd
aikit/bridge/setup-interactive.mjs
aikit/browser/contracts.ts
aikit/browser/controller.mjs
aikit/browser/dom.mjs
aikit/browser/policy.mjs
aikit/browser/privacy.mjs
aikit/browser/protocol.mjs
aikit/browser/service.mjs
aikit/unit/browser.test.mjs
aikit/integration/browser.test.mjs
```
