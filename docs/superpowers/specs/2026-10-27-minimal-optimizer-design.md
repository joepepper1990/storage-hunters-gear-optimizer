# Minimal optimiser redesign

Status: proposed design, awaiting user approval. Existing deployed base: 78611bbacc6465a4486b753b26bdd7aeb057d3f1 (2.4.0).

## Intent and constraints

Joe wants immediate answers: what to equip for each activity, which certificates to use on which items in what order, and what can be discarded. Remove explanatory prose, score breakdowns, confidence tables and alternative-combination browsing from everyday screens. Keep inventory entry, editing, favourite protection, screenshot scanning and backups. Preserve existing inventory, certificates, custom settings and roll history; no reseeding or reset.

Confirmed scoring requirement: combined Bid Arrow reduction anywhere from 65% through 85% is equally ideal. Its default priority equals Luck. Existing Lucky Grading ownership remains applicable.

## Approaches

1. Simplify the existing React/Vite app, reuse its data/persistence and corrected engines, replace the screen composition. Recommended: gives the requested experience without moving user data or maintaining duplicate applications.
2. Add a second simple/advanced interface. Rejected as a default: duplicate navigation and implementation undermine the requested substantial simplification.
3. Replace the application and migrate storage. Rejected: introduces unnecessary preservation risk.

The five-page layout and technical details below are builder proposals, rather than additional user requirements. Retain the current hosting and framework.

## Screens

### Best setup

Default landing page. Compact sections show only selected items and the few relevant combined stats. Auction sets cover Neutral, Day, Night and Rain; identical sets may share one card with context labels. Separate Drink Prep, Grading and Shop/Idle sets. A piece may appear in multiple sets. Show up to the player's four enabled Gavel slots, plus the best balanced vehicle setup: wheels, spoiler, exhaust and trailer. Use short empty-state labels when inventory is incomplete. No aggregate utility score or explanation text is required.

### Certificates

One page, numbered rows: certificate identity (including grade/mutation), target item, estimated improvement chance and Record result action. This is a ranked current-inventory action queue; each outcome is unknown until recorded. Recalculate after every result, inventory change or preference change. Never calculate later rows using an invented result from an earlier row.

Allocate no more rows than owned quantities, show each target at most once in the current queue, and re-evaluate targets after a roll. A certificate with no qualifying opportunity appears under a compact Hold section. Preserve the Main-first safety policy and specialist ordering unless the user deliberately adjusts the relevant preferences. Fix specialist target sorting before using it for the queue. Percentage measures improvement in the opportunity's relevant gameplay goal against the item's current authenticated state, under the existing protection rules. Do not relabel confidence as success probability or present conditional-on-resolved probability as full success chance; show Unknown if unresolved branches prevent a defensible full percentage. Distinguish 0% from unavailable.

Add/edit certificate batches, including distinct type/grade/mutation combinations, and adjust quantities. Keep roll recording and a compact optional history drawer. Immediate paid-reroll choices remain a short Accept / Reroll / Reroll number result shown only while the live prompt is open.

### Discard

One grouped list for gear, Gavels, vehicle parts and trailers. Only current validated proofs feed it; favourites, unknown effects, required specialist pieces and stale analyses cannot enter. Reviewable selection and explicit confirmation before removing inventory records. No automatic deletion and no explanations on rows. Empty state: Nothing to discard.

### Inventory

Category selector for gear, Gavels, vehicle parts/trailers and certificates. Add, edit, duplicate and favourite remain accessible without showing analysis paragraphs. Scanner opens the existing confirmation/editor flow; fix StrictMode lifecycle first. Focused scans still require original base confirmation, and recognised fields remain editable before save. Keep scanner only if verified; do not claim OCR is infallible or silently accept unresolved base stats.

### Preferences

Activity-specific sections: Auctions, Drink Prep, Grading, Shop/Idle, Vehicle and Gavels. Labelled 0–10 importance sliders (0 = ignore, 10 = highest) with visible values, keyboard support, reset for the selected section and immediate recalculation. No need for users to enter raw coefficients. Every displayed slider must affect its corresponding engine and certificate/retention calculations consistently; do not create decorative controls.

Auction defaults give Luck and Arrow equal priority. Other defaults retain current relative preferences. For single-metric goals, a simple priority control is sufficient; avoid invented redundant sliders. Keep default Gavel mutation-value ratios, expose adjustment without erasing existing values. Preserve arbitrary existing custom weights exactly until the relevant control is changed; use a stable reversible UI mapping or represent an existing custom value explicitly. Never silently quantise all imported settings on load.

Backup/restore and appearance remain here. Keep advanced catalogue access in a collapsed maintenance area so prior edits remain accessible without cluttering the normal workflow. Show concise actionable validation/storage errors when needed.

## Arrow model and consistency

Builder proposal: award increasing Arrow value below 65%, reach the maximum at 65%, give the same value throughout 65–85%, and give no additional benefit above 85% without inventing a penalty. Display 65–85% as the target band. Equal priority means the same default coefficient as Luck, rather than equal priority only in presentation. Apply this consistently to optimisation, certificates, numerical bounds, dominance and retention. Use shared settings/functions, not a UI-only change. Preserve signed in-game Arrow values on entry and existing reduction representation internally. Update preference defaults through an explicit non-destructive migration; unrelated custom settings survive.

## Corrective work included before release

- Unknown Limited effects must stay protected in dominance/retention.
- Certificate sorting must honour relevant specialist priorities and gains instead of item IDs.
- Empty certificate inventories and separate variants must be creatable.
- JSON roll-history values must be validated or normalised before restore; accepted data must render.
- Scanner lifecycle must work in development StrictMode and production.
- Correct the two accidentally relabelled dependency versions in the lockfile.
- Resolve the Pages rerun artifact-name collision so fresh verification can deploy reliably.

## Verification and delivery

Regression tests cover each reported defect, Arrow boundaries (below65/65/75/85/above85), equal default Luck/Arrow weighting, slider-to-engine consistency, certificate queue quantities/unique targets/current authentication and recalculation, incomplete inventories, stale-result locks, favourites/unknowns, and backup roundtrips retaining existing data. Use meaningful UI tests for navigation, add/edit/record actions and scanner lifecycle. Exercise responsive layouts and the real screenshot workflow where an available browser allows it; state any unverified OCR limitation accurately.

Run the full test suite and TypeScript/production build on the exact change head, independent review, then merge only after checks pass. Verify merged-main tests/build/deployment and the resulting site. Keep existing browser storage origin and do not modify the user's live inventory during verification.

## Left to the builder

Component/file boundaries, CSS, accessible controls, slider mapping details within the preservation constraints, performance tuning and test fixtures. Use the existing dependency set where practical. The visible UI should consist of short labels, item names, relevant values and actions.
