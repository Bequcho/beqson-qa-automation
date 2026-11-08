# Stage 4: Functional and negative test design

The eight new cases extend the seven unchanged smoke cases. Each case starts in a fresh Playwright context. The default target is the public BEQSON website, and all interactions are restricted to navigation, local calculations and rejected form validation.

## Confirmed application behavior

Production inspection on 2026-11-08 confirmed the following:

- Homepage header language links are accessible as English, Русский and ქართული. They change the URL, HTML language, visible heading and current-language marker.
- Localized homepage menus link to the corresponding localized Tools page.
- The website calculator uses discrete project, scope and add-on controls. It has no arbitrary numeric price input. It exposes a live price range, package, summary and mobile price dock.
- The smallest available scope is `1 page`; the largest offered scope category is `10+ pages`, which is not a numeric maximum.
- Selecting Landing page selects the one-page scope. No add-ons is a valid state.
- Required estimate fields reject empty values through browser constraint validation. A whitespace-only name passes the browser's required check but is rejected by the application's trimmed-value validation.
- The mobile menu changes visibility and aria-expanded, focuses the first navigation link on opening, and restores focus to the toggle after Escape. Selecting an in-page section closes the menu.

The local production-source copy was read without modification. It is not identical to the deployed scripts: for example, the deployed estimate button has no trailing arrow. Assertions use actual production accessible names and behavior. Source hashes and production findings are retained in `qa-reports/stage4-20261108-111901`.

## Cases and applicability

| ID | File | Purpose | Profiles |
|---|---|---|---|
| L1 | localization.spec.ts | EN to RU using the selector; URL, lang, Russian heading, current marker, localized Tools navigation | All |
| L2 | localization.spec.ts | RU to KA using the selector; equivalent Georgian assertions and Tools navigation | All |
| L3 | localization.spec.ts | KA to EN using the selector; equivalent English assertions and Tools navigation | All |
| C1 | calculator.spec.ts | Configure a business website, largest scope category, SEO and CRM; assert independently calculated range, package, summary and mobile dock | All |
| C2 | calculator.spec.ts | Select Landing page with zero add-ons, exercise both scope endpoints, then restore the minimum and verify reversible recalculation | All |
| C3 | calculator.spec.ts | Empty required fields and whitespace-only name are rejected locally; no network write may be attempted | All |
| M1 | mobile-navigation.spec.ts | Open/close with the toggle, reopen, close with Escape, verify visibility, aria-expanded and keyboard focus | Mobile only |
| M2 | mobile-navigation.spec.ts | Select a section link, verify dismissal and target viewport, reopen and navigate to Projects with a successful document response | Mobile only |

The desktop profiles deliberately skip M1 and M2 because the configured mobile toggle interactions do not apply to their desktop viewport. These skips are reported, never counted as passes. The existing mobile Tools smoke test is retained; M2 adds section dismissal, reopening and a different destination.

## Calculation oracle

The relevant deployed source is [website-calculator.js](https://beqson.com/assets/website-calculator.js). The inspected USD tariff assigns 249 to Business website, 149 to Landing page, 0 to one-page scope, 220 to the largest scope category, 50 to SEO and 80 to CRM. The implementation documents nearest-ten rounding, a 22% upper range for English, and package thresholds of 299/499 for Growth/Pro.

Expected values were worked out separately from the displayed output and are literal assertions. Tests do not read the application's internal state, call its estimate function, fetch current pricing at runtime, or compute expected values from the UI result.

| Configuration | Manual calculation | Expected range | Package |
|---|---|---|---|
| Business + largest scope + SEO + CRM, standard | 249 + 220 + 50 + 80 = 599; round to 600; 600 × 1.22 = 732, round to 730 | $600–$730 | Pro |
| Landing + one page + zero add-ons, standard | 149 + 0 = 149; round to 150; 150 × 1.22 = 183, round to 180 | $150–$180 | Start |
| Landing + largest scope + zero add-ons, standard | 149 + 220 = 369; round to 370; 370 × 1.22 = 451.4, round to 450 | $370–$450 | Growth |

This oracle verifies the inspected tariff arithmetic and the connection between controls and output. It is not independent commercial approval of prices: no separate signed pricing specification was supplied. Tariff changes require reviewing these expectations against an approved source, rather than replacing them with whatever the UI displays.

## Production safety

An automatic fixture in calculator.spec.ts installs a route handler before navigation. Every request with a method other than GET, HEAD or OPTIONS is aborted before reaching the network and recorded. The fixture fails if any write is attempted. The negative case also asserts that no write was attempted after each validation stage.

Only a whitespace name and a reserved `.invalid` contact value are used. The valid-submission path is not exercised. No real person is contacted and no successful response is mocked to misrepresent production delivery.

Native validation is checked through validity.valueMissing and focus rather than browser-localized error text. Application validation is checked through its visible alert. Stable IDs are used where the UI provides no unique accessible name, such as the price status and summary. The menu's aria-controls identifies the toggle when its accessible name changes after opening.

No fixed sleeps, global timeout changes, worker changes or dependencies between tests are introduced. Files in the production source repository and tests/smoke.spec.ts remain unchanged.

## Execution

Run from the QA Automation project directory:

```powershell
npm.cmd run check:types
npx.cmd playwright test --project=chromium
npx.cmd playwright test --project=mobile-chrome
```

For diagnostic runs, `--trace=on`, separate `--output` paths and HTML/JSON reporters can be supplied on the command line without changing playwright.config.ts. Keep the original failure artifacts if a repeat is needed. The execution report records actual results and intentional mobile-only skips separately.

## Explicit limits

- Zero and negative numeric prices are not supported inputs. Zero coverage means zero add-ons and a zero-cost one-page scope increment.
- The largest scope category is open-ended; the test does not claim an absolute page-count upper bound.
- The free-form contact field does not promise email-only format validation. Invalid-email rejection is not invented.
- Other service categories require a custom quote and cannot support a deterministic numeric-price oracle without additional business requirements.
- Successful lead creation, CRM behavior, messages, payments, clipboard and printing are not tested in this stage.
- Pixel 7 emulation is not a physical Android device. The expanded suite was subsequently executed locally in Firefox and WebKit during Stage 5, with the two expected desktop mobile-only skips. Those Windows results do not establish a GitHub-hosted Ubuntu CI pass.
