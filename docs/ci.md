# CI preparation and standalone repository checklist

## Status

The workflow is prepared locally and has not run on GitHub. It targets a standalone QA repository and needs no production source checkout, website build, customer data or production credentials. Existing local Windows passes do not establish an Ubuntu CI pass.

## Workflow design

Events are workflow_dispatch, push to main and ordinary pull_request targeting main. No pull_request_target, workflow_run or deployment is configured.

| Exact project | Engine installed |
|---|---|
| chromium | chromium |
| firefox | firefox |
| webkit | webkit |
| mobile-chrome | chromium |

Each GitHub-hosted Ubuntu 24.04 job uses Node.js 24, npm ci, npm run check:types and `npx playwright install --with-deps` for its engine, followed by only its assigned project.

Workers are fixed to 1. Matrix max-parallel is 1 to maintain cautious production load, and fail-fast is false so all profiles can report. An in-progress run for the same workflow/ref is not cancelled, but GitHub can replace an older pending run when a newer run is queued. Different refs can still overlap. Matrix max-parallel is not a global rate limiter.

The CI command explicitly sets retries to 0, overriding the config's existing CI retry value of 1 without changing the config. Traces are enabled for every case during rollout. Existing test and expect timeouts remain 30 seconds and 10 seconds. The separate 20-minute job budget limits infrastructure use; hard cancellation or early installation failure can prevent complete artifacts.

## Verified official action releases

Verified on 2026-11-08 using official latest-stable release API responses, tag refs and action.yml inputs. All tag refs resolved directly to commits, and no prerelease was selected.

| Action | Release | Full commit SHA |
|---|---|---|
| actions/checkout | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| actions/upload-artifact | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | cf430e030ddbb5b0abf93d22962f4752f3646cd9 |

The [Playwright CI guide](https://playwright.dev/docs/ci-intro) establishes installation, test execution and report retrieval. Its example action tags may lag newer official releases. The workflow uses the verified stable releases above. Full SHA pinning and least privileges follow [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use). Bash pipeline and concurrency semantics follow [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

Recheck release status, supported inputs and commit provenance before updating pins.

## Permissions, safety and artifacts

- GITHUB_TOKEN has contents: read only; checkout does not persist credentials.
- No production secrets, write-capable token, Pages publishing, deployment or messaging step is configured.
- The calculator request guard remains active. Future test changes and untrusted contributions still require review; the guard is not a server-side security boundary.
- Fresh job output goes only to ci-artifacts/<project> with separate HTML, JSON, console and test-results paths.
- Bash pipefail preserves the test exit status while tee records console output.
- The upload step uses always() when the runner can continue. It selects only that profile's fresh directory, never historical qa-reports or local traces.
- Artifact names include project, run ID and attempt; hidden files are excluded; overwriting stays disabled by default. Retention is 14 days, subject to repository policy.
- Artifacts can contain public page responses and test source. Review repository visibility, access and retention before publication.

No valid request is submitted. The current negative form case is rejected locally and calculator writes are aborted. Other cases only navigate and inspect. New successful submission tests need staging or approved request interception.

## Intended source contents

Include only .github/workflows/playwright.yml, .gitignore, LICENSE, package.json, package-lock.json, playwright.config.ts, tsconfig.json, README.md, the four tests/*.spec.ts files, docs/stage4-test-design.md and docs/ci.md.

Exclude node_modules, qa-reports, ci-artifacts, playwright-report, test-results, local traces/recordings, downloaded validators, environment files and authenticated state. Historical evidence stays on disk. The production source repository is not needed.

Ordinary source PNG fixtures remain eligible for future Git tracking. Generated screenshots belong in ignored output directories or use the ignored failure filename patterns. A future .env.example must be sanitized; none containing credentials is supplied. The owner approved the MIT License for the QA project, copyright 2026 Beka Khelkhelauri; see LICENSE.

## Validation and remaining hosted checks

Local validation covers TypeScript, workflow syntax, project/matrix references, lockfile consistency, intended source inventory and artifact/secret exclusions. A final local regression is useful, but no local validator executes GitHub's service or Ubuntu package installation.

The first hosted run must verify action downloads/inputs, Ubuntu browser dependencies, all four assigned profiles, worker/retry policy, expected skips, artifact upload/download and report viewing. It must also assess the unresolved Firefox image-decoding observation on Linux. Manual, push and pull-request triggers, fork approvals, retention and repository permissions require actual GitHub verification.

## Approval-dependent next steps

Stage 7 authorization approves the initial publication as Bequcho/beqson-qa-automation, Public, main, MIT. The checklist below records the publication process; it does not authorize production deployment or additional corrective pushes after a CI failure without reporting that failure first.

1. Review the prepared files, source manifest and local validation report.
2. Choose the owner, standalone repository name, visibility, default branch main and license.
3. Confirm production test scope, Actions enablement, artifact retention/access and fork approval policy.
4. Obtain explicit approval for Git initialization, repository creation, the first commit and push. Preparation does not authorize them.
5. After approval, initialize/configure the standalone repository and stage the reviewed source allowlist. Inspect staged changes and repeat the credential/artifact audit.
6. Publish only the QA source. Preserve historical evidence locally and exclude production source and credentials.
7. Run Playwright Regression manually and inspect all four jobs before claiming CI success or adding a badge.

No step above authorizes deployment of the BEQSON website.
