# Minimal Optimiser Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for implementation; independent domains may run concurrently under dispatching-parallel-agents. Steps use checkboxes.

**Goal:** Deliver the approved minimal UI, corrected safety/recommendations and equal-ideal 65–85 Arrow model without losing user data.
**Architecture:** Retain React/Vite, browser storage origin and the current calculation engines. Extract simple views and a shared preference adapter; compose them from the existing App so editors and worker freshness survive.
**Tech Stack:** TypeScript, React 19, Vitest, Vite/PWA, GitHub Pages.
**Spec:** ../specs/2026-10-27-minimal-optimizer-design.md (approved by user).

## Global Constraints

- Preserve inventory, certificate identity/quantities, settings and history; no reset/reseed.
- Arrow reductions 65–85 equally ideal; no invented excess penalty; Luck/Arrow equal default coefficient.
- Five pages: Best setup, Certificates, Discard, Inventory, Preferences. Short labels and actions only.
- Certificate queue cannot spend unavailable quantities or assume unobserved results. Unknown probability remains Unknown.
- Current-result locks, favourites and unknown-effect protection remain mandatory.

## Review Focus

- Arbitrary existing settings: preserve exactly until control changed (Task1 migration/slider regression).
- Empty/missing slots and no certificate rows: functional empty states and creation (Task3 UI).
- Multiple certificate quantities and repeated targets: allocation and freshness (Task2 queue).
- Unknown Limited effects or malformed restored logs: no destructive proof/crash (Tasks1/2).
- Concurrent edits and pagehide while changing tabs: no storage regression (Task4 full preservation suite).

### Task1: Shared scoring and preferences

Files: src/engine/scoring.ts, gearLoadouts.ts, settingsValidation.ts; src/defaults.ts, types.ts, data/storage.ts; new engine/preferences.ts and tests.
Interfaces: retain AlgorithmSettings existing fields; add optional goal priority fields as required. Export slider mapping helpers for UI and shared goal settings. Shared arrowEffective remains sole curve.
- [ ] Add failing boundary tests below65/65/75/85/above85 and unknown Limited protection.
- [ ] Verify red with Vitest or native Node adapter if local dependencies blocked.
- [ ] Implement equal defaults and non-destructive settings migration, preservation of custom values, specialist controls consumed consistently by engines.
- [ ] Verify green, record changed file list for integration.

### Task2: Certificate queue and import correction

Files: src/engine/certificateDecision.ts, new certificateQueue.ts/tests; src/data/storage.ts and import tests.
Interfaces: export buildCertificateQueue(decisions:OwnedCertificateDecision[]): queue rows containing certificate,target,chancePct:number|null; use target.decisionBasis to choose probability; no unresolved full percentages.
- [ ] Add failing specialist-sort, unique-target/quantity queue, unknown chance and string roll-score restore tests.
- [ ] Verify red; implement comparator/queue and strict roll numeric validation or normalisation.
- [ ] Verify green and targeted preservation regressions.

### Task3: Minimal screen composition

Files: src/App.tsx, styles.css, components/MinimalScreens.tsx, PreferencesScreen.tsx and related tests; update reusable VehicleScreen/TrophyScreen entry props if needed; GearScanner lifecycle test/fix.
Interfaces: App retains authoritative data, workers and existing GearEditor/RollLogEditor. New pure BestSetup and Discard views consume current computed data. Inventory delegates reusable editors in compact inventory-only modes. Preferences uses Task1 adapters. Certificates uses Task2 queue.
- [ ] Add failing render/interaction contract tests for five pages, empty certificate creation, queue row and scanner lifecycle.
- [ ] Replace navigation and visible content; remove explanatory paragraphs from main flows; implement batch add/edit and compact history/paid choices.
- [ ] Add responsive minimal styles and accessible sliders. Keep advanced catalogue/backup under Preferences disclosure.
- [ ] Verify targeted UI tests, screenshot/OCR behaviour as environment permits.

### Task4: Integration, delivery and review

Files: package.json/package-lock.json, .github/workflows/deploy-pages.yml, README.md/release notes.
- [ ] Correct only the two dependency version metadata errors; bump app version to3.0.0.
- [ ] Give Pages artifacts attempt-specific names consistently in upload/deploy so reruns succeed.
- [ ] Run complete npm test and npm run build on exact PR head via CI; review failures and fix until passing.
- [ ] Independent whole-change review; fix confirmed important findings and rerun relevant/full verification.
- [ ] Merge verified exact head; verify merged-main test/build/deploy and live output. No edits to real user inventory during checks.

Execution authorised by user's instruction to fully complete, push and publish; no further design approval required.
