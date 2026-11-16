# Windows startup repair — 2026-11-16

The normal Windows user/machine PATH did not include Git. Earlier Codex launches worked because Codex supplied a temporary runtime Git directory. Explorer/double-click startup therefore reached Node successfully but failed at the bare `spawn('git', ['credential', 'fill'])` call.

An existing GitHub Desktop installation contained a working Git 2.56.0 and Git Credential Manager. With only the persisted Windows PATH, its absolute Git executable successfully retrieved the existing credential and verified private access to `Bequcho/beqson-qa-platform`. No installation, global PATH edit, new credential, or Git configuration change was needed.

## Changes

- `lib/executables.mjs`: validates absolute Git/CLI executables; searches installed/PATH/per-user/Desktop locations; prefers GitHub Desktop over a transient Codex runtime; sorts Desktop versions numerically and rediscovers them on each start; normalizes Windows Path/PATH for credential helpers.
- `lib/github.mjs`: keeps environment-token, GitHub CLI and Git credential-helper authentication; invokes discovered executables directly; returns actionable errors without token stdout/stderr or raw spawn exceptions.
- `bridge/START-BRIDGE.cmd`, `bridge/start.mjs`: find Node from a normal Windows environment, validate startup, and start the worker in the same Node process; add `--check` and `--once` modes for noninteractive validation/restart checks.
- `bridge/bootstrap.mjs`: preserves existing checklist/source files; uses built-in Windows PowerShell with its own module path; records sanitized local startup metadata and local permission diagnostics.
- `bridge/check-public.mjs`: uses the same Git discovery outside Codex.
- `bridge/watch.mjs`: includes the real worker PID in its heartbeat.
- `unit/startup.test.mjs`: covers missing PATH Git, Desktop update/version fallback, explicit path validation, transient-Codex preference, credential-helper PATH, all authentication branches, secret-safe errors, and PowerShell module isolation.
- `README.md` and `bridge/README.md`: describe startup discovery, validation modes, recovery and manual reboot startup.

A real-launch test also found inherited PowerShell 7 module paths prevented Windows PowerShell from importing `Microsoft.PowerShell.Security` / `Get-Acl` when launched by Node. The helper now uses only its own built-in modules. This adjustment affects that child process only.

## Actual verification

- `START-BRIDGE.cmd --check` succeeded using persisted machine/user PATH with no Codex PATH additions.
- `START-BRIDGE.cmd --once` processed the existing queue; a second launch succeeded without replaying those issues.
- [Issue #14](https://github.com/Bequcho/beqson-qa-platform/issues/14): PROGRESS completed, one result comment, issue closed.
- [Issue #15](https://github.com/Bequcho/beqson-qa-platform/issues/15): RUN_NEXT processed and closed, with the scenario correctly **BLOCKED** by `MANUAL_WORKFLOW_AND_SCOPED_AUTHORIZATION_REQUIRED`. It did not run an unauthorized workflow or claim PASS.
- Result comments were retrieved through the GitHub connector. Both tasks retained exactly one result after restart.
- A separate fresh Chromium context launched and loaded the public aiKit homepage with HTTP 200 and a visible main element. All write methods were blocked. This was one navigation probe, not a rerun of the completed 84 checks, and did not use the saved profile.
- All **31 self-tests**, both TypeScript configurations, the public-source/security scan and whitespace checks passed locally.
- A SHA-256 manifest covered all 7,089 pre-existing local QA files. None was missing or unexpectedly changed. Only state/heartbeat/latest-report bookkeeping and the authorized checklist attempt changed. Removing that single appended attempt reproduced the original checklist hash exactly. Auth state, browser profiles, historical evidence, bug drafts and completed public coverage remained unchanged.
- A manual background launch using the same normal Windows environment reached a fresh successful GitHub polling heartbeat. No reboot was performed; reboot startup was tested by rebuilding the normal persisted PATH environment and restarting the actual launcher.

The bridge can run without Codex once started. After reboot, manually double-click `START-BRIDGE.cmd`. No scheduled task, registry startup entry or Startup-folder shortcut was configured. A background worker accepts the existing private queue STOP command; a visible manual console also supports Ctrl+C.

Startup has no remaining authentication or OS-permission blocker on the validated Windows account. The full official checklist workflows retain their separate authorization/automation limitations. No aiKit tokens were consumed, projects changed, content published, or bug reports submitted during this repair.
