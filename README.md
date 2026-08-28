# Storage Hunters Gear Optimiser

Mobile-first offline PWA for optimising equipment in **Storage Hunters: Open World**.

## What it does

- Stores unlimited practical inventory entries locally in IndexedDB; duplicate names are allowed because every item has a unique ID.
- Calculates every valid Head × Back × Wrist combination and ranks the top 10/25/100 using the locked **Algorithm 1.0** scoring curves.
- Scores the **combined three-item totals**, so Arrow, Energy and Bid Zone diminishing returns are handled correctly.
- Provides specialist Maximum Luck, NPC Offers, Bid Zone, useful Bid Arrow and Energy loadouts.
- Uses an analytical breakpoint proof, including the 75/80/100 Arrow regions for same-slot global dominance; it does not call an item SAFE TO DISCARD merely because it misses the Top 100.
- Protects unknown and provisional passives from irreversible discard decisions.
- Provides certificate targeting focused on estimated likelihood of improving the current best overall set, with explicit `HEURISTIC — official roll odds unknown` labelling.
- Keeps a certificate roll log and editable authentication model so empirical data can replace assumptions over time.
- Autosaves every change to IndexedDB using ordered writes, keeps an emergency localStorage mirror for recovery, works offline after first load and exports/imports JSON and CSV backups.
- Runs combination ranking, redundancy proof and certificate targeting in a Web Worker so large inventories do not unnecessarily block the iPhone UI.

## Bid Arrow input convention

Enter **Bid Arrow Speed exactly as the game displays it**.

- Game `-24% Bid Arrow Speed` → internally `+24% Bid Arrow Reduction`.
- Game `+3% Bid Arrow Speed` → internally `-3% Bid Arrow Reduction`.

The editor always shows the conversion before saving.

## Locked Algorithm 1.0 defaults

- Luck: `1.00`
- Bid Arrow reduction: `0.85`; full value to 75%, 25% marginal value from 75–80%, flat from 80–100%, then each 1% above 100% subtracts one full unit of effective Arrow by default (a `0.85` point penalty per excess 1%).
- NPC Offers: `0.75`
- Energy Drink Time: `0.55`; full value to 50%, 10% marginal value from 50–100%, zero additional value above 100%.
- Bid Zone Width: `0.40`; full to 30%, 75% marginal 30–60%, 50% marginal above 60%.
- Tip Chance: `0.10`
- Bid Recovery / Vehicle Speed / Walkspeed: `0.01` each.
- Rush: `0.15` per 1% Rush.
- Sunny / Nocturnal uptime: `0.50`.
- Raindrop uptime: `0.25`.
- Time Keeper and Grade Re-Roll coefficients default to zero and remain explicitly provisional/protected.

All settings are editable in-app and can be reset to the locked defaults.

## Authentication handling

The nine core fields should contain the **final stats displayed on the item**. For normal numeric authentication, the separate authentication effect/value is metadata used by the re-authentication optimiser to remove the existing roll and calculate its marginal value. It is not scored a second time.

Unknown Alien effects (Haggler, Anti-Gravity Field, Safecracker and Exhibitor) are stored as first-class effects but score zero and protect the item from SAFE TO DISCARD.

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

There is no backend, login, analytics service or remote database. Gear data is stored in the browser's IndexedDB on the device, with an emergency localStorage mirror used only as a recovery fallback. Writes are serialised so a rapid sequence of edits cannot let an older save finish after a newer one. Use **Settings → Download JSON backup** regularly, especially before clearing Safari website data or changing devices. Imports reject malformed/non-finite numeric data instead of allowing `NaN` or `Infinity` into the optimiser.

## Tests

Regression coverage includes:

- all scoring curves and thresholds;
- negative values;
- Arrow 75%, 80%, 90%, 100%, 101%, 105%, 110% and 120% regressions, including the >100 penalty;
- Energy 50/100 transition;
- Zone 30/60 transition;
- Crab Backpack, Diamond Jellyfish Wristband + Rush, Cobwebbed Race Valk and Reactor Wristband fixtures;
- combined nonlinear scoring;
- duplicate names and empty slots;
- analytical dominance proof;
- unknown-passive protection;
- JSON/CSV round trips, blank numeric fields and malformed-data rejection;
- certificate heuristic determinism.

## Licence

Personal companion project. No copyrighted game artwork is included.
