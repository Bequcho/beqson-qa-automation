# Windows bridge operator notes

Start with [../README.md](../README.md) and [../CHATGPT.md](../CHATGPT.md). Launch `START-BRIDGE.cmd`; use `LOGIN-AIKIT.cmd` only for manual login/expired sessions. No administrator elevation should be needed for normal use. Auth/profile/evidence files belong to the Windows user that runs startup; do not alternate service accounts or copy profiles into source control.

## Task lifecycle

`running → report_ready → reported → done` is persisted before each external action. On restart, a `running` entry uses its completed local report if available; otherwise it becomes INTERRUPTED and pauses testing. It is never silently rerun. A deterministic remote result marker prevents duplicate publication if GitHub accepted a comment but its response was lost. A `reported` entry retries issue closure even if absent from the open queue.

Only new issues by Bequcho with a strict V2 envelope (or the three original V1 commands) are processed. Malformed authorized queue requests become REJECTED without browser execution; unrelated issues/PRs/other authors are ignored. A closed task describes an execution disposition, not necessarily a successful test. A new issue is required for an intentional retry. Do not delete receipts to force a retry.

Legacy V1 checkpoints are backed up and migrated without replaying their tasks. Migration starts paused. Entries that were not done retain `legacyRequiresReview`; inspect the old reports before manually retrying them in new issues. Lost local state with an existing remote claim also requires review; it never starts the old browser task again.

## Review after a failure

1. Inspect the run's local report, trace and screenshot. Open traces locally with `npx playwright show-trace PATH`; do not upload private traces to a web viewer.
2. Distinguish a test/harness problem, environmental blocker, suspected application issue and confirmed defect.
3. Reproduce only when safe and authorized. Compare the live program's existing reports saved under `program-history/` to avoid duplicate reporting. A draft in `known-issues.json` is not evidence that this review happened.
4. For a confirmed defect, prepare one concise English plain-text report using Title, Steps to reproduce, Expected, Actual, Impact, Severity, Category. Submit to aiKit only with explicit user approval. Keep private details/evidence local.
5. After the user approves continuation, create RESUME with `{"reviewIssue":ISSUE_NUMBER}` matching the held task. A finding from a standalone run requires `{"reviewRunId":"UUID"}` instead. Resume does not repeat the interrupted/failed task; use a new RETEST issue referencing the known bug ID and scenario.

## Official result review format

Store this JSON locally, fill it from actual observations, and replace the hash with SHA-256 of the current full `objective` in `checklist.json`:

```json
{
  "scenarioId":"official.audio-kit.01",
  "status":"PASS",
  "criterionHash":"SHA256_OF_FULL_CURRENT_CRITERION",
  "actual":"Describe only the observed result for every required clause.",
  "steps":["Exact executed browser action"],
  "expectedBehaviorVerified":true,
  "reviewedByUser":true,
  "evidence":["runs/UUID/artifacts/local-evidence.json"],
  "relatedKnownBugReports":[]
}
```

This is a format example, not an executed test. FAIL needs confirmed observations and evidence too. BLOCKED needs a specific `blocker`. Evidence must resolve inside the local evidence directory, be nonempty, and be reviewed; a file's existence alone cannot prove application behavior. The recorder stores hashes and prior status for audit. Items with truncated source text cannot be finalized through this recorder.

## Recovery

- Missing Node: install Node.js 24 with npm, then reopen START.
- Missing dependencies/browser: START installs from the lockfile and installed Playwright CLI.
- GitHub auth failure: sign in locally using the existing Git helper or `gh auth login`; never send the token to chat. Prefer a fine-grained token scoped to the private queue's Issues and Metadata permissions when provisioning new credentials.
- Expired aiKit login: stop bridge, run LOGIN, then restart. Session-storage-only authentication would require an additional local fixture; no such dependency was needed by the validated session.
- Lock active: close the other local bridge/test process. Dead-owner locks recover automatically. An unreadable/reclamation lock fails closed; inspect processes and back up state before repairing it manually.
- Corrupt state: preserve it and restore a known-good private backup. The bridge refuses to reset it to an empty queue.
- Network interruption: keep the bridge running; it backs off and retries publication without replaying completed browser actions.
- Evidence quota: archive local evidence together with checkpoint/history references. The bridge never recursively deletes history for you.
- Queue unresponsive: inspect local `heartbeat.json`, then GitHub/Windows network access. No public port, webhook or tunneling service is required.
