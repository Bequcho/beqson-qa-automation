# BEQSON QA Automation

[![Playwright Regression](https://github.com/Bequcho/beqson-qa-automation/actions/workflows/playwright.yml/badge.svg?branch=main)](https://github.com/Bequcho/beqson-qa-automation/actions/workflows/playwright.yml)

A Playwright and TypeScript portfolio project for the multilingual [BEQSON Digital Studio website](https://beqson.com). The suite covers public navigation, localization, calculator behavior, client-side validation and mobile menu interactions.

The project is self-contained. It does not require the production source repository, a website build, customer data or production credentials.

**Verified CI:** On November 8, 2026, the first [Playwright Regression run](https://github.com/Bequcho/beqson-qa-automation/actions/runs/42474856816) passed all four browser jobs on GitHub-hosted Ubuntu: Chromium, Firefox, WebKit and Mobile Chrome. The suite contains **15 unique test scenarios**; across the four profiles, the run recorded **54 Passed, 0 Failed and 6 expected Skipped**. The skips are the two mobile-only navigation tests in each desktop profile, not missing scenarios.

## Technology

- Node.js 24 and npm, with reproducible dependencies from package-lock.json.
- Playwright Test; the current lockfile selects version 1.65.0.
- TypeScript, checked with `tsc --noEmit`.
- GitHub Actions CI on GitHub-hosted Ubuntu 24.04.

## Coverage and browser profiles

There are **15 unique test cases**, regardless of browser profiles or repeated executions.

| File | Cases | Coverage |
|---|---:|---|
| tests/smoke.spec.ts | 7 | Root redirect, EN/RU/KA pages, Tools navigation, contact-link markup and canonical/alternate links |
| tests/localization.spec.ts | 3 | EN → RU, RU → KA and KA → EN through real controls, followed by localized Tools navigation |
| tests/calculator.spec.ts | 3 | Configured price/package, scope endpoints and zero add-ons, rejected empty/whitespace requests |
| tests/mobile-navigation.spec.ts | 2 | Menu dismissal and focus, section navigation, reopening and Projects navigation |

See [Stage 4 test design](docs/stage4-test-design.md) for the calculation oracle and safety boundaries.

| Exact project name | Profile | Expected applicability |
|---|---|---|
| chromium | Desktop Chrome | 13 cases; 2 intentional mobile-only skips |
| firefox | Desktop Firefox | 13 cases; 2 intentional mobile-only skips |
| webkit | Desktop Safari profile using Playwright WebKit | 13 cases; 2 intentional mobile-only skips |
| mobile-chrome | Pixel 7 emulation in Chromium | All 15 cases |

**Mobile Chrome uses device emulation, not physical Android hardware.** Windows/Linux WebKit is not equivalent to Safari on physical iOS hardware or macOS.

## Local installation

Install Node.js 24, open a terminal in the project and run:

```bash
npm ci
npx playwright install chromium firefox webkit
```

On Linux, install browser system dependencies as well:

```bash
npx playwright install --with-deps chromium firefox webkit
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy blocks the corresponding PowerShell launchers.

## TypeScript and test execution

```bash
npm run check:types
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project=mobile-chrome
```

`check:types` is the TypeScript script. There is no `check` script.

Existing shortcuts:

```bash
npm test                  # All four configured projects
npm run test:chromium     # Desktop Chromium
npm run test:mobile       # Pixel 7 emulation
npm run test:ui           # Interactive Playwright UI
```

The config keeps one worker and a 30-second test timeout. Tests use fresh contexts and do not depend on earlier cases.

The default target is `https://beqson.com`. To test an independently started local copy or approved staging environment, set `BEQSON_BASE_URL`. Example in PowerShell:

```powershell
$env:BEQSON_BASE_URL='http://127.0.0.1:8000'
npm.cmd run test:chromium
```

This QA project does not start or contain the production website. The CI workflow fixes its target to the public site and needs no production secrets.

## Reports and traces

Normal local runs create `playwright-report/` and `test-results/`:

```bash
npm run report
npx playwright show-trace path/to/trace.zip
```

The config retains screenshots/video on failure. Use `--trace=on` when successful traces are also needed. Reusing default output directories can replace previous output; choose separate output/report paths when preserving a sequence.

Historical `qa-reports/`, local traces and recordings are ignored by Git. They remain local and are excluded from the repository.

## GitHub Actions CI

[.github/workflows/playwright.yml](.github/workflows/playwright.yml) supports manual execution, pushes to `main` and pull requests targeting `main`. The first successful run was triggered by a push; pull-request and manual triggers require separate verification.

Each job checks out the QA repository, selects Node.js 24, runs `npm ci` and `npm run check:types`, installs its assigned browser/Linux dependencies, and runs only its assigned Playwright project.

- Matrix: chromium, firefox, webkit, mobile-chrome; mobile-chrome installs Chromium.
- One worker per job, one active matrix job at a time, and fail-fast disabled.
- Zero automatic retries expose the first failure; this CLI policy overrides the config's existing CI retry value without editing it.
- Traces are enabled for all cases during initial CI rollout.
- Official Actions are pinned to full SHAs for stable releases verified on 2026-11-08.
- Read-only repository permissions, no persisted checkout credentials, no production secrets and no deployment.
- The 20-minute job budget limits infrastructure usage; it does not change individual test timeouts.

Only fresh `ci-artifacts/<project>/` output is uploaded: HTML, JSON, console log and test evidence. Artifact names include project, run ID and attempt. Retention is 14 days, subject to repository policy. Historical reports are never selected. An early setup failure may leave no files; upload warns while the job remains failed.

To inspect a GitHub run, open **Actions → Playwright Regression → the run → Artifacts**. Download/extract the profile artifact and serve its HTML report:

```bash
npx playwright show-report path/to/extracted-artifact/html-report
```

The badge above dynamically reports the workflow status for `main`; it is not a permanent success label or the status of an individual pull request. See [CI design and verification](docs/ci.md) for verified results and remaining checks.

## Production safety

- No valid customer request, payment or external message is submitted.
- Contact smoke tests inspect href attributes without opening WhatsApp, Telegram or email.
- Calculator tests install an automatic request guard before navigation. Methods outside GET/HEAD/OPTIONS are aborted and recorded; any attempted write fails the fixture.
- Negative validation uses a whitespace-only name and reserved `.invalid` contact. Invalid submit interactions are rejected locally; the successful submission path is not exercised.
- The guard applies to calculator tests. Other cases only navigate/inspect; it is not a blanket browser firewall or server-side security test.
- No production credentials, authenticated storage state or real customer data are required. New write-related cases need approved staging or interception.

## Known limitations

- The first hosted run verified the current assertions on Ubuntu, the push trigger and artifact upload. A single pass does not establish long-term stability; pull-request/manual triggers, artifact download/viewing and fork behavior need separate verification.
- Firefox emitted `Image corrupt or truncated` during some language transitions, reproducible in isolated KA → EN runs despite passing assertions. Separate PNG integrity/decoding checks succeeded. This remains **an unresolved diagnostic observation, not a confirmed production defect**; its cause is not established and it has not been suppressed.
- Tests do not fail on every console.error; passing assertions do not imply a clean browser console.
- No full visual regression, physical-device coverage, CRM delivery or successful production-form submission is claimed.
- The calculator uses discrete choices. Expected prices are separately calculated from the inspected tariff, but no independent approved commercial specification was supplied.
- Public copy, prices and URLs can change. Review expectations against agreed requirements when planned changes occur.

## License

This QA Automation project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Beka Khelkhelauri.

The license covers this QA project. The production website is a separate project; this repository does not deploy or modify it.
