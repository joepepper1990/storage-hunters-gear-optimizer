# Storage Hunters Optimiser

Mobile-first offline PWA for Storage Hunters: Open World.

[Open the app](https://joepepper1990.github.io/storage-hunters-gear-optimizer/)

## Current authoritative inventory and rules — 21 November 2026

The owner confirms **80 accessories total** (39Head,26Back,15Wrist), from78 photos plus2 reported additions. The reviewed plan is3 worn,54 display,16 storage and7 recommended disbands. All80 remain owned; the plan does not record completed removals.

- [Full agreed rules](docs/rules/gear-and-collection.md)
- [Complete80-item evidence JSON](docs/audits/2026-11-21-inventory.json)
- [Collection/storage/disband assessment](docs/audits/2026-11-21-collection.md)
- [80-item spreadsheet](docs/audits/2026-11-21-collection.csv)

The current rule is **95% minimum Arrow reduction → maximum Luck → Bid Zone**, with no overshoot penalty. Wear the best setup first; display a separate remaining copy based on combined mutation value; retain useful future copies; disband only proven surplus, lowest displayed value first. The rules above supersede older version descriptions below.

These files commit the assessed data and rules. The running app's seed/migration and collection UI are not changed by this documentation/data commit. Witch Robe and one photographed Safe Wristband retain unconfirmed stats; those are not invented or silently replaced with zeroes.

## Version 3.1

- Home: saved Arrow reduction target slider (100% default), best Head/Back/Wrist and faster/slower alternatives.
- Rank every trio by closest Arrow target, highest Luck, widest Bid Zone, then Recovery, Energy, Tip and NPC. Walkspeed and fishing are excluded. These priorities are user preferences, not game drop probabilities.
- Golden Hour defaults to +100 Luck; Droughtbreaker defaults to zero stacks with 0–5 control. Intermission defaults to zero with 0–125 control because it is spent on one auction.
- Equipment: best set, expandable Keep list, conservative discard review, editable inventory and Gavels.
- Gavels: four explicit recommendations with current charms, preserving Mosaic Luck before a heuristic mutation-value comparison. Descriptive names, attached charm editing, listed spare charms and optional 50-gem single-attachment opportunities. Destination charm unlock is required; no in-game action is performed automatically.
- Certificates: possible improvements and backup protection; no published chance figures or paid reroll prompts. Unknown ranges stay unknown. Carnival slot restrictions and five effects come from owner-supplied in-game screenshots.
- Settings: theme, backups, optional existing cloud sync and maintenance.

## Confirmed inventory and mechanics

The current inventory is 41 Head, 13 Back, 9 Wrist, 5 Gavels and the 10 best listed spare charms. Latest grading corrections are included. Grade and condition remain absent when unknown; neither is inferred from value. Displayed values are metadata.

Base stats and blue certificate bonuses stay separate. The Void Elegant Business Backpack has original Luck 80 plus an observed Focused delta of 23, displaying 103. Replacing the certificate removes that delta.

The in-game Mutated Luck screen confirms: each worn accessory contributes only its strongest listed mutation. Silver 5, Gold 10, Corrupted 15, Diamond 20, Gem 25, Chrome 30, Hologram 35, Void 40, Secret 45, Rainbow 60 and Onyx 75. The effect itself is head-only; the contribution sums Head, Back and Wrist.

Mosaic counts itself, applies only the strongest placed Mosaic and grants its roll per distinct placed charm type. The owner's current four distinct types give 4 ×13 =52 Luck. Clover adds percentage points to a gavel's best native mutation boost; Secret101 +Clover28 =129.

## Certificate limits and discard protection

Effect selection probabilities and several roll-strength ranges are unpublished. Internal sample comparisons are opportunities, not official odds or guarantees. A Use requires either an unaffected complete backup for every checked context/state or a proof that every possible effect adds only nonnegative value to a clean item. Existing blue bonuses are still evaluated as replacement costs. Recommendation order compares the resulting Arrow/Luck/Zone sets, without assuming outcome probabilities. Consider requires no sampled loss and no unresolved downside. Current blue bonuses are removed before evaluating replacements. Carnival unknown magnitudes are not invented.

Discard requires a same-slot replacement proof with equal native/effective Arrow, no worse relevant native/effective stats or mutation contribution, compatible effects and strict improvement. A strongest-native-stat guard protects future Focused opportunities. Favourites, unresolved effects and current certificate targets are kept. Missing a sampled future role is never proof of disposal.

Schema21 applies the owner's complete new inventory once on startup. Matching items retain identity/favourites, and explicit backup restores preserve their inventory. Later edits are not reseeded. Existing certificate quantities and roll history are retained.

## Development

```sh
npm ci
npm test
npm run build
npm run dev
```

Historical algorithm tests use explicit pre-November fixtures; current requirements and inventory are covered separately. GitHub Actions tests, builds and deploys main to GitHub Pages.


### 3.2: compact auction workspace

- Teal/slate mobile layout, grouped auction stats, compact gear cards and expandable detail.
- Navigation stays outside the scrolling content pane. Switching pages starts at the top.
- Linked Arrow and gear Luck sliders: the last slider moved controls the closest-match goal. Arrow ties maximise Luck; Luck ties favour the chosen Arrow target, then Bid Zone and secondary auction stats.
- Fixed passive assumptions: Golden Hour +100%, Droughtbreaker 0 stacks, Intermission 0%. Charm Luck is shown separately from the gear Luck slider.
- Certificate summaries show potential, unknown exact odds, replacement risk and possible set. Unpublished probabilities are never presented as measured chances.
- Discard proofs preserve different Luck contributions so later slider choices remain possible. Inventory search and short batches reduce scrolling.
- Saved inventory, charms, certificate quantities and history are preserved.


### 3.2.1: Arrow minimum

Arrow is now a minimum threshold, default 95%. Below the minimum, the smallest shortfall wins. At or above it, maximise Luck, then Bid Zone and other auction tie-breaks. Extra Arrow receives no reward or penalty. The Luck slider explores only sets with the best attainable Arrow shortfall. Older closest-target preferences migrate once to the 95% minimum; inventory and history are preserved.


### 3.2.2: mobile dialog actions

Shared dialogs render above the app scroll layer. Form fields scroll independently while Save/Cancel stay visible at the bottom of the dialog, including on short mobile viewports. Mobile input text avoids Safari focus zoom. Inventory and history remain unchanged by the update.
