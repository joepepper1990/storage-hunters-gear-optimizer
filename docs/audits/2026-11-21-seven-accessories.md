# Seven-accessory reconciliation — 21 November 2026

Two exact copies were previously assessed; five exact copies were missing. All seven remain owned according to the owner. The register now contains **85 copies: 40 Head, 29 Back, 16 Wrist**. There is no recorded sale, disband or physical move in this review.

## Verified history and decisions

Baseline: main commit [`0d0a74d`](https://github.com/joepepper1990/storage-hunters-gear-optimizer/commit/0d0a74dbbbcfa4ae72a2aa4f884ce8329927dbe5). The original explicit collection decisions were committed in [`5fa2c99`](https://github.com/joepepper1990/storage-hunters-gear-optimizer/commit/5fa2c99929125c58d85511e20ba11b751244151c), in `docs/audits/2026-11-21-collection.md` and `.csv`. Searches covered current source/docs and fetched branch history; absence means no verifiable exact-copy record in those sources, not proof about every past chat or in-game action.

| Accessory | Previously recorded? | Previous recommendation | Current recommendation |
|---|---|---|---|
| Tactical Vest — $16,486.20, Tip7.4 | No exact match | N/A. The recorded plain Vests have Arrow44/NPC11 or Luck38/Energy19, not these stats. | **Keep — chest.** Clean Tip/possible Focused alternative; no current auction upgrade. |
| Limited Candy Corn Antlers — $2,699.20, condition91 | No exact match | N/A. Historical `head-candy-corn-antlers` is condition76, Energy12/NPC3.6; it is a different roll. | **Keep — display.** Limited collection copy of a type absent from the current 80-copy register. |
| Military Stopwatch Wristband — $11,215.26, Zone24/Walk16/Luck-5 | **Yes: IMG_8416.jpg** | **Disband**, fifth in the seven-copy lowest-value-first list. Retained witness: Secret/Silver/Mint Stopwatch IMG_8414.jpg, Zone29/NPC5.8/Luck-5. | **Other — disband remains recommended** under the unchanged auction policy. Still owned; condition57 is now confirmed. |
| Gold Sailor Bag — $13,250.16 | No exact match | N/A | **Keep — display**, with a clean Zone alternative available. |
| Gold/Sapphire/Fortified Tactical Vest — $16,930,944 | No exact match | N/A. It is separate from the Chrome, Emerald and plain Vests. | **Keep — protected chest/display contender.** Retain the Emerald display Vest too while combined mutation ranking is unresolved. |
| Military Stopwatch Wristband — $21,465.60, Luck58/NPC8.6 | No exact match | N/A. Neither the Zone24 copy nor the Corrupted Energy24 copy has this roll. | **Keep — chest**, for Luck/NPC specialist use and future combinations. |
| Hologram Steampunk Jacket — $232,407, Luck83/NPC4.7 | **Yes: IMG_8401.jpg** | **Keep for display** in the 80-copy collection audit. The identical Hologram roll was also in the earlier 63-copy runtime inventory, including condition88. | **Keep — display**, with a Luck/NPC alternative available; condition88 confirmed. |

The five missing copies have **no verified previous equip/keep/sell decision**. Do not attribute a recommendation to them based only on a shared item name. The prior $15,872.76 Vest disband recommendation applies to the Luck38/Energy19 copy, not either newly reported Vest.

The historical Antlers record was introduced in commit `564a4f5`; its verification tag is 30 October, whereas this owner's newly reported copy was found 1 November. It was removed from later complete snapshots and is not silently reintroduced here. The exact Hologram Jacket roll is verifiable in `src/data/currentInventory.ts` at commit `4635066`; the saved Display decision is verifiable in `5fa2c99`. Earlier dynamic optimiser screens do not establish a saved, immutable recommendation, so none is invented.

## Exact item information

All seven were found by **Markersaur**. These are displayed totals; mutation contributions are already included. Negative game Arrow speed would be stored as positive Arrow reduction, but none of these seven reports has an Arrow modifier.

| Copy | Rarity / modifiers | Value | Condition | Stars as reported | Displayed stats | Found |
|---|---|---:|---:|---|---|---|
| Tip Tactical Vest | Epic; none displayed | $16,486.20 | 65% | 2 white | Tip +7.4%; no negatives | 15 Nov 2026 |
| Candy Corn Antlers | Rare; Limited | $2,699.20 | 91% | None displayed; grade unknown | Tip +2.2%; NPC -1.5% | 1 Nov 2026 |
| Zone Stopwatch | Epic; none displayed | $11,215.26 | 57% | 1 gold | Zone +24%; Walk +16%; Luck -5% | 19 Nov 2026 |
| Sailor Bag | Epic; Gold | $13,250.16 | 89% | 1 gold | Zone +8.6%; no negatives | 21 Nov 2026 |
| Stacked Tactical Vest | Epic; Gold, Sapphire, Fortified | $16,930,944 | 80% | 2 light blue | Recovery +12%; Energy +23%; Luck -5% | 21 Nov 2026 |
| Luck Stopwatch | Epic; none displayed | $21,465.60 | 58% | 3 gold | Luck +58%; NPC +8.6%; no negatives | 21 Nov 2026 |
| Steampunk Jacket | Epic; Hologram | $232,407 | 88% | 1 gold | Luck +83% (includes +52 from Hologram); NPC +4.7%; Walk -1% | 6 Nov 2026 |

Rarity and star colour are retained as metadata. Neither creates an invented additional stat/value multiplier. No stars displayed is not converted into a confirmed zero-star grade. Authentication is recorded as none reported in the supplied full stat lists; no hidden effect is invented.

## Why these decisions hold

1. **Tip Vest:** the worn Chrome Vest already has Tip8.2, Luck110 and maximum Golden Hour100, so Tip7.4 does not justify swapping. However, a clean Tip roll has a different strongest native stat and future Focused use from a Luck-led Vest. No complete future-use disposal proof exists, so retain it in the chest; do not spend a certificate merely because it is retained.
2. **Antlers:** Tip2.2/NPC-1.5 is weak for auctions and reduces NPC offers. The Limited label and separate collection type justify a display copy despite that. Do not sell it solely because a different Head has higher stats.
3. **Zone Stopwatch:** the retained display Stopwatch has five more Zone points and 5.8 more NPC points with the same -5 Luck. This copy's advantage is Walk16. The owner explicitly excludes Walkspeed from use/ranking; the disband recommendation is therefore still correct for their stated needs. This is an auction-policy decision, not a claim that every individual stat is dominated. If movement becomes a wanted specialist goal, keep it instead. Neither earlier recommendation performed an in-game action.
4. **Gold Sailor Bag:** Zone8.6 is below the Pickle Backpack's Zone47, but it avoids that bag's Energy-6 penalty. It also provides a Gold collection copy and the confirmed Gold contribution for Mutated Luck when used in an appropriate set. Keep the only recorded Sailor Bag for display; it remains wearable as a clean Zone alternative. It does not offset the worn Vest's Luck/GH loss.
5. **Stacked Vest:** Recovery12/Energy23 may serve a drink/recovery alternative, but Luck-5 and no Arrow prevent a routine auction upgrade. Its price and three modifiers justify protected collection retention. The existing Bullet Sash offers Recovery16/Energy31 but has Zone-5, a different mutation profile and grading potential; that is not a complete disposal proof for this Vest. Do not recommend selling the $16.9m item from an overall-stat comparison.
6. **Luck Stopwatch:** NPC8.6 is the highest confirmed wrist NPC stat in the register, alongside Luck58 and no penalties. Autumn Fox73Luck/55Zone remains stronger for Luck/Zone; Jellyfish32Arrow/54Luck remains necessary in the current best set. The new copy is a useful NPC/Luck specialist, not a reason to remove the Secret/Silver/Mint display copy or confuse it with the old Zone Stopwatch.
7. **Jacket:** Hologram collection value and Luck83/NPC4.7 justify retaining the existing display copy. Its -1 Walk is immaterial to current policy. Chrome Vest110Luck/GH100 wins the routine slot; the Jacket remains an NPC/Luck alternative and collection piece. Its total is Luck83, **not 83+52**.

## Current worn setup

Re-optimising with all 85 records leaves the set unchanged: **Spec Ops Dominus (Arrow80/Recovery34), Chrome Tactical Vest (Luck110, Golden Hour), Diamond Jellyfish Wristband (Arrow32/Luck54)**. Fixed routine totals remain **112% Arrow reduction and 264% gear Luck**, before the separately recorded 52 charm Luck. No item in this seven-copy review should replace a piece of that recorded routine setup.

Current collection plan: **3 worn + 56 display + 19 chest + 7 recommended disbands =85**. The two pre-existing stale-tooltip copies remain protected and excluded from the confirmed-stat optimum. Provisional choices are not proof that all game mechanics have been resolved.

## Mutation research boundary

The public [TechWiser mutation table](https://techwiser.com/storage-hunters-mutations/) lists Emerald40 and Sapphire60, but its prose and table disagree on an example Gold factor. Other public references disagree about additive versus multiplicative stacking, including [this stacking guide](https://storagehunterswiki.com/guides/mutations-stacking-rules) and [this mutation guide](https://allthings.how/storage-hunters-open-world-mutations-and-their-value-multipliers/). No verified Fortified factor was found. These are community sources, not sufficient authority to silently change the project's existing combined-value policy or infer unknown Mutated Luck contributions.

The safe decision is to retain **both** the new triple-modified Vest and Emerald Vest. The existing representative display choice remains provisional; the new Vest stays protected in the chest until the full comparison is supported. Reported price alone does not settle mutation quality across different condition/grade/modifier systems. No effect on auction stats is invented for Sapphire/Fortified.

## Recorded changes

- Added five rows in `2026-11-21-seven-accessories.json`, with exact stats, rarity, modifiers, reported star count/colour, condition, price, finder, discovery date and reasons.
- Updated the two existing evidence rows and spreadsheet metadata in place; no second Jacket or Zone Stopwatch was created.
- Updated the current collection assessment, 85-row CSV, README and rules to reference this review. Baseline history remains available by commit.
- Runtime schema23 appends missing additions once and matches already manually entered exact copies. It preserves existing identities, locks, edited stats, certificates, gavels, history and imports. Explicit imports and later deletions are not reseeded.
- No item was removed from ownership by this reconciliation.
