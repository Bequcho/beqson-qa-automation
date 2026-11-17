# Phase 2: verified dismissal and isolated workflow foundations

This change builds on draft PR #8's post-assertion snapshots. It does not merge
any PR, refresh the official checklist, execute historical language tests, or
enable production uploads/mutations/generation. Issue #6 remains open.

## Available through the browser queue

The existing five browser commands remain compatible. `BROWSER_ACT` and
`BROWSER_BATCH` additionally accept `dismiss` with an ordinary opaque target.
The reviewed aiKit drawer appears as `label: "Dismiss backdrop"`, `kind:
"backdrop"`, and `allowedOps: ["inspect", "dismiss"]` only when all of these
preconditions hold:

- The origin is aiKit (or the loopback test fixture).
- There is exactly one empty `.sh-drawer-scrim` div outside forms in an open
  aiKit shell, one expanded Open menu toggle and the expected sidebar.
- The backdrop is fixed, visible and pointer-enabled, with an exposed point
  outside the sidebar. A fresh hit-test must hit the backdrop itself.

These selectors are compiled into the reviewed adapter; issues cannot supply
them. The action revalidates the actual retained node, uses a normal Playwright
click at a locally computed exposed point, then verifies the drawer is closed
and its toggle has expanded=false. It never forces a click, removes an overlay
or changes page CSS. Unknown modal/backdrop patterns remain unsupported.

Example params for BROWSER_BATCH after OPEN/INSPECT:

```json
{"steps":[
  {"op":"click","target":{"ref":"last","match":{"role":"button","label":"Open menu"}},"assertions":[{"type":"expanded","target":{"ref":"acted"},"value":true}]},
  {"op":"dismiss","target":{"ref":"last","match":{"kind":"backdrop","label":"Dismiss backdrop"}},"assertions":[{"type":"hidden","target":{"ref":"acted"},"value":true}]}
]}
```

Observations add bounded counts for forms, invalid/required fields, file inputs,
download attributes, dialogs, progress indicators and alerts. Counts describe
the DOM, including hidden nodes; they do not prove visible usability. Field
metadata includes required/invalid/readOnly/multiline/multiple booleans and an
allowlisted input kind. No values, field names, accept strings, customer text,
selectors, arbitrary attributes or click coordinates enter public results.
Existing privacy vocabulary, 24,000-character result bound and local-only
screenshots/traces remain in force. All browser network writes stay denied.

## Local artifact and fixture pipeline

`sandbox/artifacts.mjs` accepts bounded byte streams into generated IDs within a
run-specific protected local vault. It records SHA-256, byte count, MIME/magic
checks and structural metadata. It supports PNG/JPEG/WebP dimensions, PCM WAV
duration/rate/channels, PDF header/trailer checks and bounded DOCX ZIP inspection
without extraction. DOCX external relationships, entities, traversal paths,
encrypted entries and excessive expanded sizes are rejected.

Validation is **structural**, not antivirus scanning, full document rendering,
perceptual QA or complete media decoding. A structurally valid artifact is not
an official workflow PASS. MP3, FLAC and MP4 inspectors/valid fixture encoders
are not delivered in this increment and remain blocked.

Limits: 8 MiB per artifact, 32 MiB per run and 32 artifact attempts per run.
Quota is reserved before writing; a failed/interrupted transfer keeps its
reservation/quarantine and cannot bypass the disk budget. File handles close on
every path. Generated IDs and path/hash checks prevent suggested download
filenames from selecting output paths. Rejected bytes are retained locally;
there is no automatic deletion of evidence. Retention is manual review, within
the quotas; no public file server or remote screenshot route is added.

`sandbox/fixtures.mjs` generates only synthetic PNG/JPEG/WebP, PDF, DOCX and
100-ms silent PCM WAV fixtures, plus deliberately invalid and oversize files.
It preserves original hashes, verifies existing catalog bytes and rejects
arbitrary paths or changed fixtures. No user-file picker or user-file path is
accepted by a queue command. Image generation uses a blank local canvas, not
an AI service. Private detailed metadata stays local; `publicArtifact()` exposes
only allowlisted type and validation/presence booleans, without filenames,
hashes, sizes, contents, paths or URLs.

The sandbox can validate an actual Playwright server-attachment download and
an HTTP streamed export. Browser download staging also stays in its sandbox.
Cancelled downloads fail closed; the routed HTML `download`-attribute variant
cancelled in local Chromium and is not claimed as supported. Live browser
downloads still use acceptDownloads=false and are cancelled.

## Signed grants and mock lifecycle

`sandbox/client.mjs` is an **offline mock-contract adapter**. Its constructor is
disabled by default. Even enabled, it accepts only an exact HTTP 127.0.0.1
origin with a port. Every request rechecks this restriction; redirects are
rejected. The transport methods are private and there is no write-through
proxy, queue endpoint, or production endpoint mapping.

`sandbox/grants.mjs` verifies Ed25519 envelopes using a trusted local public key.
The worker has no signing operation or private signing key. Test signing keys
exist only in test process memory. Runtime approval files belong in the
bootstrap-protected data directory; they are never accepted in an issue.
There is no live approval-signing UI in this increment.

A signed manifest binds exact origin, account, route, generated synthetic ID,
QA-prefixed object name, run ID, allowed operation names, expiry, maximum
actions, bytes, cleanup plan and independent spending limits. Generation adds
an exact tool and fixture identifier. Revocation and durable action/token
reservations are checked before dispatch. A numeric budget without a valid
signature/scope cannot authorize a request. Failed reservations are not refunded
automatically. Operation limits count adapter operations; internal identity,
ownership and verification GETs are also restricted to the fixed mock contract.

The mock lifecycle is create -> edit -> read/persist -> export -> cleanup, with
an optional synthetic fixture upload. Creation disables publication and
notifications, records a prepared ID before dispatch and marks it owned only
after verifying returned identity/account/run/name. Edits, exports, uploads and
cleanup require that owned local record and fresh server ownership verification.
Cleanup deletes only that exact ID and verifies a subsequent 404.

Completed operation IDs return their recorded receipts. An interrupted ID
cannot replay; an uncertain create needs a separately authorized read/recover
operation that verifies the prepared object's ownership before cleanup. No
discovery/deletion of arbitrary or existing projects is allowed. A revoked or
expired grant cannot start a new operation; reading a cached completed receipt
performs no request and does not extend permissions.

Mock generation has a signed estimate, max total reserved tokens, max generation
operations and independent before/after usage checks. It persists a hold before
the usage audit/dispatch. Missing, inconsistent or interrupted usage leaves it
blocked for local review. No real AI service is called by these tests.

**Production remains hard disabled**, including with a signed mock grant and a
positive budget. Reviewed live endpoint/response/billing contracts, exact
synthetic-account ownership, explicit human approval, a spending limit, cleanup
validation and additional tests are prerequisites for a future live adapter.
This PR provides no way for a GitHub issue to turn those capabilities on.

## Validation and deployment

Run `npm run check:types`, `npm run aikit:test`, `npm run aikit:check-public`,
`npm run aikit:browser-test`, and `git diff --check`. The last suite includes
real Chromium plus loopback mock-server end-to-end cases. CI uses the same
locked dependencies and suites, with no aiKit session or live test calls.
The TypeScript check covers the browser and sandbox contracts; runtime MJS
behavior is validated by unit/integration tests.

PR #8 was deployed separately and live private queue #65 verified both route
assertions against their captured routes: Voice Kit `/tools/voice-kit`, then
Back `/tools/audio-kit`. This is navigation evidence, not official item coverage.

For cutover, save a protected inventory/checkpoint backup; send browser-lane
STOP; await its result and lock release; switch only the isolated interactive
checkout to the reviewed commit; run START-INTERACTIVE.cmd; RESUME; inspect with
fresh IDs. The legacy checkout/worker and original auth seed remain independent.
Do not copy a test signing key/catalog into the live account or enable uploads
to validate this release. Live validation may navigate, inspect and dismiss the
reviewed drawer only. Detailed deployment receipts stay protected locally and
are reported separately from mock results.

Remaining issue #6 work includes production adapters and signing UX, additional
media formats, full visual/media validation, criterion mapping and reconciliation
of truncated requirements, and separate phone/consent/third-party verification.
The 99 official statuses and 84 historical language checks remain untouched.

## Exact documented walkthrough entry routes (read-only extension)

The current aiKit Round 2 Hub brief explicitly points testers to these walkthrough entrypoints:
- `/home/projects?walkthrough=1` — Your websites (authenticated)
- `/catalog/site-plan?walkthrough=1` — Site Plan
- `/tools/connect?walkthrough=1` — Bring in a site
- `/tools/voice-kit?walkthrough=1` — Voice Kit
- `/tools/audio-kit?walkthrough=1` — Audio Kit
- `/tools/live-chat?walkthrough=1` and `/tools/pro-designer-automate?walkthrough=1` — lighter-pass tools

This **does not** mean the legacy `/tools/site-plan` marketing route is the interactive planning workflow. Walkthrough mode must be verified through the actual resulting DOM, not assumed from HTTP 200 or path alone. Opening a walkthrough does not complete an official criterion.

The browser policy authorizes the `/catalog/site-plan` path **only**, not arbitrary `/catalog/**`, and only accepts `walkthrough=1` at the reviewed routes above. Read-only network constraints, no-spend/no-write policy, local evidence and redacted route reporting remain unchanged. The browser may still return a limited UI if an unknown application API read is blocked. That outcome should be documented as BLOCKED, not classified as a site bug without independent reproduction.
