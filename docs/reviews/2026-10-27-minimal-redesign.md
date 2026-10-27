# Minimal optimiser redesign, v2.5.0

Base main: 78611bbacc6465a4486b753b26bdd7aeb057d3f1 (v2.4.0).

## Scope

Five answer-first screens (Best setup, Certificates, Discard, Inventory, Preferences) on the existing React/Vite app, storage origin and engines. Explanatory prose, score breakdowns, confidence tables and alternative-combination browsing were removed from everyday screens.

## Model changes

| Change | Detail |
| --- | --- |
| Arrow band | Value peaks at 65% combined reduction and is flat through 85%; nothing extra above 85%, no penalty. Shared `arrowEffective`, so optimisation, certificates, dominance bounds and retention agree. |
| Arrow priority | Default coefficient equals Luck (1.0). |
| Specialist priorities | Drink Prep / Grading / Shop / Idle priorities (default 8 / 6 / 4, preserving the previous order). 0 ignores the activity in sets, retention and certificates. Shop Tip / NPC importances replace the fixed 0.4 / 0.3 (same defaults). |
| Settings migration 2.0 → 2.1 | Only values still equal to the old defaults (Arrow 0.8, sweet spot 75%) move. Custom and unrelated values are kept exactly. No inventory, certificate or history change. |

## Corrections

| Finding | Correction |
| --- | --- |
| P1: unknown Limited effects reached SAFE TO DISCARD | One kind-independent effect classifier (`engine/effects.ts`) used by scoring, dominance (both sides of a proof) and retention. Regression covers Limited, Premium, Normal and Alien for every unknown effect. |
| P2: specialist ties sorted by item ID | Targets carry a goal rank (user priority order) and goal-native conservative gain; the comparator uses them before IDs. |
| P2: no certificates in an empty workspace / no variants | Add / edit / quantity helpers keyed by type + grade + mutation; identical variants merge, distinct ones stay separate. |
| P2: malformed JSON roll history | Restore validates and types every roll field (numeric strings become numbers; malformed rows are rejected with the row number). Startup coerces leniently so saved history is never dropped. |
| P2 (dev): scanner hang under StrictMode | The mounted flag is re-armed on every effect mount. |
| Lockfile labels | es-module-lexer 2.3.2 and why-is-node-running 2.3.0 now match their tarballs. |
| Pages re-run artifact collision | Artifact name is unique per run attempt and passed to deploy through a job output. |

Also: Discard never offers an item the current certificate queue targets; the shared loadout evaluator computes trio stats once (differentially tested against the previous full sort), cutting certificate analysis on the default inventory from about 47 s to 8 s.

## Verification boundary

The scanner was exercised in Chromium with real Tesseract OCR on a synthetic tooltip image, in both production and the StrictMode dev server. A genuine in-game screenshot was not available, so OCR accuracy on real game art is not claimed.
