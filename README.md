# Storage Hunters Optimiser

Mobile-first offline PWA for Storage Hunters: Open World.

[Open the app](https://joepepper1990.github.io/storage-hunters-gear-optimizer/)

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

Effect selection probabilities and several roll-strength ranges are unpublished. Internal sample comparisons are opportunities, not official odds or guarantees. A Use requires an unaffected complete backup for every checked context/state; Consider requires no sampled loss and no unresolved downside. Current blue bonuses are removed before evaluating replacements. Carnival unknown magnitudes are not invented.

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
