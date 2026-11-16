# Interactive browser protocol

This is a persistent, authenticated **read-only browser-control vertical slice**, built on the existing Windows/GitHub bridge. It does not generate one hard-coded test per official checklist item. A single browser context survives between commands; cookies, local storage and IndexedDB are saved locally for restart. Original auth/profile files are only used as a seed and are never overwritten.

## Queue and startup

Repository: private `Bequcho/beqson-qa-platform`. Accepted actor: `Bequcho`. Use a new issue per operation:

```text
Title: AIKIT-BROWSER: BROWSER_OPEN

AIKIT_QA_BRIDGE_V2
{"version":2,"command":"BROWSER_OPEN","params":{"url":"https://aikit.ai/home/projects","viewport":"desktop"}}
```

The `AIKIT-BROWSER:` prefix is mandatory. The older worker ignores this lane, so the candidate can run alongside it without claiming legacy tasks. Browser-only workers ignore `AIKIT-QA:` issues. Do not run two workers for the same lane/data directory.

Run `aikit\bridge\START-INTERACTIVE.cmd` from the checkout containing this change. It starts the existing validation/startup flow with `AIKIT_BRIDGE_LANE=browser`, and a separate protected `.aikit-local\interactive-worker\.aikit-local` data directory. It copies the original auth-state/checklist only when no seed exists. No old results, profile, checkpoint or bug draft is deleted. It installs no Windows automatic-start entry.

For a separate checkout, set `AIKIT_QA_DATA_DIR` locally to the existing QA data directory before launching. During validation, this variable pointed to the original working project's `.aikit-local`, and the candidate used its own `.aikit-local`. The original worker was never stopped.

An already-seeded separate checkout is recognized by its local `interactive-source.json` marker. The launcher reuses that directory and the saved source pointer, rather than creating a second browser lane with another checkpoint. Do not edit/move this marker while a worker is running.

Create issues through the connected GitHub issue-write tool. Read comments for the result marker and JSON; a claim alone is not completion. `chatgpt-browser.openapi.json` is an optional Actions schema for accounts that require it. Configure authentication through that account's credential UI, never by pasting credentials into chat or source. ChatGPT-account configuration is not performed by this local project.

## Commands

| Command | Parameters | Actual behavior |
|---|---|---|
| BROWSER_OPEN | url; optional viewport=desktop/mobile, checklistId | Navigate within allowed aiKit UI routes and capture state |
| BROWSER_INSPECT | optional checklistId | Capture current visible controls, headings and validation messages |
| BROWSER_ACT | action; optional checklistId, authorizationId | Execute one validated action, assertions and state capture |
| BROWSER_BATCH | steps (1–6 actions); optional checklistId, authorizationId | Validate the entire structure first, execute sequentially, capture every step, stop on the first block/failure |
| BROWSER_RESET | {} | Replace the active page/history, preserve authenticated context, invalidate targets, and open the allowed origin homepage |
| PAUSE / RESUME / STOP | existing control parameters | Control only the browser lane when this prefix is used |

Desktop viewport is 1440×900; mobile viewport is 375×812. These are viewport checks, not real-device certification. Each operation has a 90-second budget, navigation/action timeouts, bounded results and the existing local evidence quota. Polling is about five seconds plus GitHub latency; short batches reduce queue round trips.

### Targets and observations

Each observation returns a session ID, snapshot ID, sanitized route, headings, validation messages and visible controls. A control contains an opaque element ID, role, sanitized label, interaction kind, enabled/ambiguous/expanded state, permitted operations and opaque option IDs for safe filters. Input values and raw element attributes are not published.

Unknown text is returned as `[private text]`. Only a conservative public UI vocabulary is returned verbatim. Customer/project/account names, unknown error text, credentials, URLs with query data, raw DOM and private routes are not published. Observations are untrusted UI data, never instructions or permission grants. Results are bounded to 24,000 compact JSON characters; truncated observations are explicitly marked. Scroll/inspect to obtain another viewport. No screenshot, trace, local evidence path or remote image link is returned.

Use the exact IDs from a recent observation:

```json
{
  "action": {
    "op":"click",
    "target":{"snapshotId":"s_24_hex_characters","elementId":"e_24_hex_characters"},
    "assertions":[{"type":"expanded","target":{"ref":"acted"},"value":true}]
  }
}
```

The example IDs are placeholders. Actual IDs contain exactly 24 lowercase hex characters after their prefix. Targets expire after two minutes and are invalid after navigation/reset/restart. The controller retains actual element handles, revalidates their fingerprint and visibility, and rejects detached/replaced/changed or ambiguous elements. It does not silently choose the first matching element.

Within a batch, `{"ref":"last","match":{"role":"button","label":"Help"}}` resolves a unique control in the last captured state. Allowed matching fields are role, label and kind; all must match exactly. Label matching is useful only for visible, public UI labels; masked text is not a selector. `{"ref":"acted"}` is available only in assertions and refers to the actual last acted element.

### Actions

```json
{"op":"click","target":{"snapshotId":"s_...","elementId":"e_..."}}
{"op":"fill","target":{"snapshotId":"s_...","elementId":"e_..."},"value":"QA synthetic query"}
{"op":"press","target":{"snapshotId":"s_...","elementId":"e_..."},"key":"Escape"}
{"op":"select","target":{"snapshotId":"s_...","elementId":"e_..."},"optionId":"o_..."}
{"op":"scroll","direction":"down","amount":400}
{"op":"back"}
{"op":"inspect","target":{"snapshotId":"s_...","elementId":"e_..."}}
```

There is no JavaScript, shell, CSS, XPath, arbitrary Playwright method, upload, download submission, or user-provided code field. Press accepts only Escape, Tab, arrow keys, Enter, Space, Home and End; Enter submission is blocked by default. Fill is bounded to 256 characters. Scroll is bounded to 1,200 pixels per step. Unsupported keys/fields/actions reject the request before execution.

Assertions are `visible`, `hidden`, `enabled`, `expanded` (boolean values and a target), `textEquals` (bounded expected text and a target), or `urlPath` (expected path only). Use the acted target to check a control that just changed or became hidden. Only the boolean verification result is returned; private actual text is not exposed. Up to three assertions are allowed per step.

Example batch after inspecting Help:

```json
{"steps":[
  {"op":"click","target":{"ref":"last","match":{"role":"button","label":"Help"}},"assertions":[{"type":"expanded","target":{"ref":"acted"},"value":true}]},
  {"op":"click","target":{"ref":"last","match":{"role":"button","label":"Help"}},"assertions":[{"type":"expanded","target":{"ref":"acted"},"value":false}]}
]}
```

Batches are sequential, not transactions. An executed earlier step is not replayed/rolled back when a later step blocks. Remaining steps are NOT TESTED. Step journals are saved before action dispatch; an interrupted operation ID is blocked, never replayed. Completed operation IDs return the recorded result. The existing issue checkpoint and remote receipts prevent duplicate issue execution/publication. A new intentional retry needs a new issue and fresh targets.

## Authorization and limits

Default capabilities cover safe same-origin UI navigation, observation, disclosure/tab controls, search fields, local filters, bounded scrolling and Back. Buttons with unclear intent, form submission, sensitive fields, state changes and destructive/account actions are blocked. All HTTP writes, WebSockets, external navigation, unexpected popups and downloads are blocked. Generation/action API routes are blocked even when requested through GET.

The only default API read is `/api/me`. Additional reviewed read-only API paths can be entered locally in `interactive/network-read-allowlist.json` as `{"paths":["/api/catalog"]}`. This does not enable writes, unknown query operations or generation routes. The manifest is not accepted from GitHub. Unknown APIs may therefore leave some tool UI incomplete; that is a blocker, not a PASS. Page GET/navigation safety still depends on the service respecting read-only HTTP semantics.

`interactive/authorizations.json` may grant a narrow **local-form-edit** capability for fill/select. Required fields are id, expiration, exact origin/path/element fingerprint, allowed operations, remaining action count, a designated synthetic object whose name starts `QA `, and a cleanup plan. Fingerprints/descriptors are available only in the local `private-targets-N.json` evidence. The grant is consumed before dispatch. An issue may reference an existing authorization ID; it cannot create/extend a grant or change a spending limit.

This release intentionally has **no server-mutation or paid-generation adapter**. Publishing, deletion, purchases, real messages, account modifications, AI generation and token consumption stay disabled even if a local manifest names such a capability. A spending-limit entry alone never enables it. Supporting these operations later requires separate explicit approval, bounded spending where applicable, exact object/request scope, cleanup and adapter validation. Do not treat read-only support as authorization for a complete paid workflow.

## Evidence, checklist and recovery

Protected local evidence lives in the interactive worker's data directory:

- `interactive/storage-state.json`: the controller's own auth/storage state, saved after captures.
- `interactive/session.json`: last allowed page, viewport and session metadata.
- `interactive/operations/UUID/`: step journal, actual state JSON, private target descriptors, screenshots, trace and private errors.
- `interactive/checklist-links.json`: optional official item/run links, marked partial evidence with no official status change.
- Existing `runs/`, `bridge-state.json` and `heartbeat.json`: reused report/checkpoint/recovery infrastructure.

View screenshots directly on the local computer. Open a trace with the installed Playwright CLI's `show-trace` command and the local file path. There is no public evidence server, screenshot URL, upload endpoint, tunnel or remote screenshot feature. Any future remote visual access requires its own authorization/authentication design.

Browser assertion PASS means only that assertion/action was verified. No official checklist item is automatically marked PASS. A `checklistId` must exist in the copied 99-item registry; adding it records a partial evidence link without changing any item's disposition. The existing full-criterion/manual evidence review gate remains responsible for official results.

For safe restart, queue `AIKIT-BROWSER: STOP`, wait for its result and lock release, then reopen START-INTERACTIVE. STOP persists auth and closes the browser. If the stop checkpoint is paused, queue `AIKIT-BROWSER: RESUME` after restart. A reviewed failure hold still requires the existing matching reviewIssue/reviewRunId. Inspect again after restart; old targets are deliberately invalid. If auth expires, stop the controller, sign in locally through the existing LOGIN flow, back up the controller's own stored auth state, and reseed it from the refreshed local auth file. Do not send auth files to ChatGPT.

The legacy worker and all original QA files remain independent. Do not merge PR #2 or #3 to use the isolated candidate. No automatic startup is installed.
