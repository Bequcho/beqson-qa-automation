# aiKit Round 2 — no-credit QA automation

This directory adds a separate, read-only public-site test suite to the existing BEQSON Playwright/TypeScript repository. BEQSON tests and the main branch remain unchanged until the branch is explicitly merged.

## Scope and official checkpoint

Official aiKit Round 2 has 99 checklist items in 9 cards:
- Your websites — 8
- Site Plan — 10
- Bring in a site — 8
- Voice Kit — 11
- Audio Kit — 27
- Website modules — 5
- Live Chat — 14
- Pro Designer Automate — 11
- Languages — 5

The previous saved Work checkpoint was 11 PASS, 5 FAIL, 3 BLOCKED, 80 NOT TESTED (November 13, 2026). It must be reconciled with the current Team program before changing any official task status. Separate language localization reviews are observations, not automatic proof that all five official Languages tasks are completed.

## Automatic public checks (safe)

Run from the repository root:

```bash
npm ci
npx playwright install chromium
node aikit/qa.mjs
node aikit/qa.mjs --all
```

First invocation checks remaining 5 locales: Haitian Creole, Simplified Chinese, Traditional Chinese, Japanese, Korean. Second checks all 28 locales. For each locale it performs desktop HTTP status, language-selection inspection, actual reload, actual click on localized Tools, browser Back, mobile 375x812 page load, horizontal overflow measurements and a mobile menu interaction where a reliable control can be identified. Results are recorded in `aikit-qa-results/report.json` and `report.md`.

The GitHub Actions workflow `aikit-public.yml` runs the remaining five locales automatically on pushes to `feature/aikit-round2-free-qa`. Once integrated with the default branch, it can also be dispatched manually to run all 28 locales.

## Honest QA boundaries

PASS is recorded only for an action actually executed. An unidentified mobile menu is NOT_TESTED, not a FAIL. A script cannot guarantee every element is visually legible, or prove the quality of screenshots/downloads. Those need manual review. Do not file a new bug for a repeated known translation issue until checking existing aiKit reports.

**Never put aiKit session cookies, credentials, client data, or personal information into this PUBLIC repository.** Do not let this CI job sign in, create AI assets, submit forms, consume paid aiKit tokens, or alter existing projects.

## Completing all 99 items

Use local Playwright tests on the tester's own PC for the authenticated cards (Your websites, Site Plan, Bring in a site, Voice Kit, Audio Kit, Website modules, Live Chat, Pro Designer Automate). Run tests on isolated made-up test projects with a saved local login state. Keep auth files locally and excluded from version control. Some speech generation, site builds, real-device checks, subjective quality checks, and cross-app handoffs necessarily require careful review and may consume aiKit's own free allowance.

Each official item needs a durable status PASS / FAIL / BLOCKED / NOT_TESTED, exact evidence and reproduction details, and should be reconciled with the real aiKit Team program. Stop on the first confirmed bug, prepare one concise English report, and await confirmation of submission before resuming.

## Cost

GitHub Actions standard hosted runners on PUBLIC repositories are free within GitHub's documented policy. The script runs without third-party browser-agent credits. Local Playwright runs without paid cloud-browser credit. Compute/network and aiKit service limits can still apply.
