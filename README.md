# Storage Hunters Optimiser

Mobile-first offline PWA for optimising equipment in **Storage Hunters: Open World**.

## What it does

- Stores unlimited practical inventory entries locally in IndexedDB; duplicate names are allowed because every item has a unique ID.
- Calculates every valid Head × Back × Wrist combination and ranks the top 10/25/100 using the locked **Algorithm 1.1** scoring curves.
- Scores the **combined three-item totals**, so Arrow, Luck, NPC Offers, Energy and Bid Zone diminishing returns are handled correctly.
- Provides specialist Maximum Luck, NPC Offers, Bid Zone, best Bid Arrow utility and Energy loadouts.
- Uses an analytical breakpoint proof, including the 75/90/100 Arrow regions for same-slot global dominance; it does not call an item SAFE TO DISCARD merely because it misses the Top 100.
- Protects unknown and provisional passives from irreversible discard decisions.
- Provides certificate targeting focused on estimated likelihood of improving the current best overall set, with explicit `HEURISTIC — official roll odds unknown` labelling.
- Adds a separate vehicle/trailer optimiser using the in-game formulas verified on the Dumpster Truck.
- Adds a four-slot Gavel Trophy optimiser that reports only the best four Gavels to equip, with editable mutation-value weights.
- Keeps a certificate roll log and editable authentication model so empirical data can replace assumptions over time.
- Autosaves every change to IndexedDB using ordered writes, keeps an emergency localStorage mirror for recovery, keeps the main optimiser available offline after first load and exports/imports JSON and CSV backups.
- Runs combination ranking, redundancy proof and certificate targeting in a Web Worker so large inventories do not unnecessarily block the iPhone UI.
- Adds an experimental **local gear screenshot scanner**: choose a Storage Hunters screenshot, run OCR on-device, identify the large gear tooltip rather than the tiny TOTAL BONUSES panel, use the game's blue stat text as the authentication signal, then review the draft in the normal Gear editor before saving.


## Experimental local gear screenshot scanner

Version 1.5 adds **Gear → Scan screenshot** for fast inventory entry on iPhone. The scanner is deliberately review-first: it never writes a scanned item directly into inventory.

Flow:

1. Choose a Storage Hunters gear screenshot from Photos.
2. The browser prepares a high-contrast copy locally and lazy-loads Tesseract.js OCR.
3. OCR line positions are used to prefer the large gear tooltip over small duplicate stat text elsewhere in the screenshot (especially the TOTAL BONUSES panel).
4. The original screenshot colours are sampled locally. Green tooltip stats are treated as base stats; the blue tooltip stat is treated as the separate authentication roll.
5. The scanner infers Head / Back / Wrist from the recognised item name where possible.
6. A confirmation sheet shows the detected item, confidence, warnings, parsed stats and raw OCR text.
7. **Review in gear editor** opens the normal add-item editor, where every field can be corrected before Analyse & add.

The screenshot and OCR result are **not uploaded to an AI service or app backend**. Tesseract.js runs in the browser. On the first scan, the OCR engine/language assets may need to download before recognition starts; after those browser caches are available, repeated scans avoid that first-load cost.

This is intentionally labelled experimental. OCR can misread small text, unusual screenshots or partially hidden tooltips, so the existing Gear editor and validation remain the authoritative save path.

## Bid Arrow input convention

Enter **Bid Arrow Speed exactly as the game displays it**.

- Game `-24% Bid Arrow Speed` → internally `+24% Bid Arrow Reduction`.
- Game `+3% Bid Arrow Speed` → internally `-3% Bid Arrow Reduction`.

The editor always shows the conversion before saving.

## Locked Algorithm 1.1 defaults

- Bid Arrow reduction: `1.25`; full value to 75%, 25% marginal value from 75–90%, flat from 90–100%, then a gentle 25% penalty rate above 100% (`0.3125` score lost per excess 1%).
- Luck: `1.00`; marginal value is 1.00 from 0–100%, 0.80 from 100–150%, 0.60 from 150–200%, 0.40 from 200–250%, and 0.20 above 250%. There is no Luck cap.
- Bid Zone Width: `0.50`; full to 30%, 75% marginal 30–60%, 50% marginal above 60%.
- NPC Offers: `0.35`; full to 20%, 75% marginal 20–40%, 50% marginal above 40%.
- Energy Drink Time: `0.55`; full value to 50%, 10% marginal value from 50–100%, zero additional value above 100%.
- Tip Chance: `0.10`.
- Bid Recovery: `0.05`.
- Walkspeed: `0.02`.
- Vehicle Speed: `0.01`.
- Legacy Rush remains scoreable at `0.15` per 1% Rush for historical Alien-authenticated gear, but Alien authentication is no longer available for new rolls.
- Sunny / Nocturnal uptime: `0.50`; Raindrop uptime: `0.25`. Their expected Luck is fed through the same total-Luck diminishing-return curve instead of receiving free linear score.
- Time Keeper defaults to zero and remains explicitly provisional/protected. Historical Grade Re-Roll data is preserved for legacy compatibility but is no longer an active certificate outcome.

All settings are editable in-app and can be reset to the locked defaults. Existing Algorithm 1.0 browser settings migrate automatically to 1.1 without deleting inventory or history.

## Authentication handling

The nine core fields contain the item's **normal/base accessory stats excluding the separate numeric authentication roll**. Normal numeric authentication is stored separately and automatically added to the effective stats by the scoring engine. Current normal numeric outcomes are Luck, Bid Recovery, Bid Arrow Speed, Bid Zone Width, **Energy Drink Time**, Tip Chance, NPC Offers Bonus and Walkspeed. Energy Drink Time authentication adds directly to the base Energy value before the existing 0–50 / 50–100 / >100 diminishing-return curve is applied.

The Alien event is retired from active gameplay in the app. New Alien authentication and Alien certificate targeting are disabled. Historical gear and roll-history records with Alien effects such as Rush remain loadable and visible; known legacy effects can continue scoring under their retained legacy coefficients, while unknown legacy effects remain protected from SAFE TO DISCARD.

Event-specific effects such as Fossil Finder, Luck Frenzy, Auto X-Ray, Featherweight, Second Chance and Steady Hand are informational only and score zero.

## Local development

Requires Node 22+.

```bash
npm install
npm run dev
```

Run tests and a production build:

```bash
npm test
npm run build
```

## GitHub Pages deployment

The repository contains `.github/workflows/deploy-pages.yml`. Every push to `main`:

1. installs the pinned dependencies with `npm install`;
2. runs the unit/regression test suite;
3. builds the PWA;
4. uploads `dist` as a Pages artifact;
5. deploys it using GitHub's Pages deployment action.

If Pages has never been enabled for the repository, open **Repository Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions** once. The workflow can deploy thereafter.

The Vite production base and PWA scope are configured for:

`/storage-hunters-gear-optimizer/`

Expected Pages URL for GitHub user `joepepper1990`:

`https://joepepper1990.github.io/storage-hunters-gear-optimizer/`

If the repository is renamed, update `base`, `scope`, and `start_url` in `vite.config.ts`.

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Confirm **Add**.
5. Open **Gear Optimiser** from the Home Screen once while online. The service worker then keeps the app available offline.

## Data and privacy

There is no app backend, login, analytics service or remote database. Gear data is stored in the browser's IndexedDB on the device, with an emergency localStorage mirror used only as a recovery fallback. Gear screenshots selected for the local scanner are processed in-browser and are not uploaded by the app. Writes are serialised so a rapid sequence of edits cannot let an older save finish after a newer one. Use **Settings → Download JSON backup** regularly, especially before clearing Safari website data or changing devices. Imports reject malformed/non-finite numeric data instead of allowing `NaN` or `Infinity` into the optimiser.

## Tests

Regression coverage includes:

- all scoring curves and thresholds;
- negative values;
- Arrow 75%, 80%, 90%, 100%, 101%, 105%, 110%, 120% and 130% regressions, including the gentle >100 penalty;
- Luck 100/150/200/250 diminishing-return transitions and conditional-Luck passives;
- NPC 20/40 diminishing-return transitions;
- Energy 50/100 transition;
- Zone 30/60 transition;
- Crab Backpack, Diamond Jellyfish Wristband + Rush, Cobwebbed Race Valk and Reactor Wristband fixtures;
- combined nonlinear scoring;
- duplicate names and empty slots;
- analytical dominance proof;
- unknown-passive protection;
- JSON/CSV round trips, blank numeric fields and malformed-data rejection;
- certificate heuristic determinism;
- local scanner parsing, noisy stat aliases, Arrow sign conversion, tooltip-vs-TOTAL-BONUSES selection and blue authentication separation.

## Licence

Personal companion project. No copyrighted game artwork is included.

## Vehicle optimiser

Version 1.1 adds a separate vehicle/accessory optimiser for **Spoiler × Exhaust × Wheel Stack × Trailer** combinations. Empty slots are included, so an accessory with a bad enough trade-off can correctly lose to equipping nothing.

The current confirmed Dumpster Truck baseline is preconfigured:

- Base Speed: `69`
- Base Acceleration: `1.00×`
- Base Handling: `90`
- Base Capacity: `2750 kg`
- 50% vehicle-capacity gamepass multiplier: `1.50×`

Confirmed accessory maths from in-game tests:

- Speed percentages from parts **add together**, then apply to base Speed.
- Acceleration percentages from parts **add together**, then apply to base Acceleration.
- Trailer capacity is added to base vehicle capacity **before** the capacity multiplier.
- Flat part capacity (currently observed on Wheel Stacks) is added **after** the capacity multiplier.

Therefore:

`Final Speed = Base Speed × (1 + total Speed% / 100)`

`Final Acceleration = Base Acceleration × (1 + total Acceleration% / 100)`

`Final Capacity = (Base Capacity + Trailer Capacity) × Capacity Multiplier + flat part Capacity`

The seeded known inventory is:

- `[Silver] Tractor Wheel Stack`: +15% Speed, +15% Acceleration, +60 kg.
- `Manta Spoiler`: +26% Speed, -16% Acceleration.
- `Caution Line Exhaust`: +18% Speed, +18% Acceleration.
- Wooden Trailer: +175 kg.
- Trailer: +300 kg.
- Long Trailer: +600 kg.

With the Long Trailer, Tractor Wheels, Caution Line Exhaust and Manta Spoiler, the optimiser predicts **110 Speed, 1.17× Acceleration, 90 Handling and 5085 kg capacity**.

The balanced performance score is deliberately labelled as an optimiser model rather than a game mechanic. Default priorities are Capacity 45%, Speed 30%, Acceleration 15% and Handling 10%, all editable. Each dimension is compared as a percentage improvement over the active vehicle baseline before the relative priorities are applied.


## Gavel Trophy optimiser

Version 1.2 adds a dedicated Gavel Trophy inventory and four-trophy optimiser. Enter each trophy's one or two mutation chance boosts exactly as displayed in game. The optimiser uses the community Relative Added Value Boost comparison: each boost percentage is multiplied by the editable mutation value multiplier, then all powered trophies are combined.

Version 1.2.1 strengthens trophy discard protection: a trophy is never marked SAFE TO DISCARD if it is required by the maximum specialist set for any enabled mutation (for example Maximum Chrome), even when it is not part of the best overall weighted set.

Version 1.3 speeds up inventory entry. Gavel Trophy names are generated automatically from their modifier rolls (for example `Silver +54%` or `Gem +110% / Silver +50%`). Gear and vehicle parts now keep a short manually entered base name and automatically append every non-zero stat. Trophy inventory can be sorted by score, name, or any specific mutation boost in either direction. Item notes and obtained-date fields have been removed, and Wet is included in the default trophy modifier list.

Version 1.3.1 introduced stricter trophy retention, and 1.3.2 fixed its regression coverage.

Version 1.3.3 replaces that output with the current-game rule: the Gavel optimiser now reports **only the best four Gavels to equip**. It no longer produces Top 10/25/100 alternate Gavel sets, mutation-specialist Gavel sets, or KEEP / SAFE TO DISCARD verdicts for non-selected Gavels. Inventory management, cloning, editing and mutation-weight controls remain available.

- Equipped Gavel limit is locked to 4 for optimisation (or all owned Gavels when fewer than four exist).
- Optimiser output is a single **BEST 4 GAVELS** set with each Gavel's modifiers, combined mutation boosts and total relative score.
- Non-selected Gavels remain in inventory with no optimiser retention/discard verdict.
- Default weights: Silver 2x, Gold 4x, Corrupted 6x, Wet 1.4x, Diamond 8x, Gem 10x, Chrome 12x, Hologram 15x, Void 35x, Secret 50x, Rainbow 100x, Tiny 2x and Huge 2x.
- All weights are editable. Secret/Rainbow/Huge are visibly confidence-labelled because public sources are less consistent than the established core multipliers.
- Trophy score is a relative heuristic, not literal expected cash value, because the normal mutation base probabilities remain unpublished.
