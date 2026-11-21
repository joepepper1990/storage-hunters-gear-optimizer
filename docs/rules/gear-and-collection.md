# Authoritative gear and collection rules

Owner-confirmed on 21 November 2026. This document supersedes older policy descriptions in the repository, including the old Arrow band/closest-target rules. It records the rules to implement and the reviewed inventory plan; committing these documents alone does not wire that plan into the running app.

## Complete inventory and evidence

- The complete accessory inventory is **80 distinct copies**: **39 Head, 26 Back, 15 Wrist**.
- Source: 78 photographs in `SHG1.zip`–`SHG8.zip`, plus two explicitly reported new copies. Different copies with the same name must remain separate.
- The two additions are Safe Wristband (14% Arrow reduction, +17% Bid Zone) and Gold Gem Backpack (11% Arrow reduction, +2.8% Tip Chance, -5% Luck).
- The new Safe Wristband is separate from both photographed Safe Wristbands. Its mutation, grade, condition and value are unspecified. The Gem Backpack's grade, condition and value are unspecified.
- Canonical evidence: [80-item inventory JSON](../audits/2026-11-21-inventory.json). Reviewed destinations: [CSV](../audits/2026-11-21-collection.csv), [assessment](../audits/2026-11-21-collection.md).
- Recommendations do not mean an item has been moved or disbanded. All 80 remain owned until the owner records an actual change.
- Gavels and charms are separate from these 80 accessories; the photos do not establish a new complete gavel/charm inventory.

## Best worn setup: unchanged auction priorities

1. Select one Head, one Back and one Wrist from confirmed accessory stats.
2. Arrow reduction is a **minimum threshold**, default **95%**. It is not an exact target or a band.
3. Below the minimum, minimise the Arrow shortfall before considering other stats.
4. At or above the minimum, extra Arrow earns no reward and incurs no penalty. **Maximise Luck**.
5. Equal Luck: maximise **Bid Zone Width**, followed by **Bid Recovery**, **Energy Drink Time**, **Tip Chance**, then **NPC Offers Bonus**.
6. Walkspeed is never a selection/tie-break criterion. Fishing, fish tanks and bait are excluded.
7. All game passes are owned. Never assume a missing game pass limits the setup.
8. The optional Luck slider is an exploration tool; it must not bypass the Arrow minimum. The collection assessment's future-best protection refers to the auction policy above, rather than preserving every artificially lower Luck target.
9. Each UI view, optimiser and certificate comparison must use the same ordering. Do not change gear-selection priorities to favour collection rarity or monetary value.

## Luck, authenticating and displayed stats

- Fixed routine assumptions: **Golden Hour +100 Luck**, **Droughtbreaker 0 stacks**, **Intermission 0 Luck**. Golden Hour is its maximum, not guaranteed immediate session Luck. Intermission is a one-auction boost, not routine permanent Luck.
- Droughtbreaker can add its recorded Luck per stack, up to five stacks. Use active/sensitivity states to protect useful alternative items without claiming a published average.
- Gear Luck, conditional Luck and gavel/charm Luck must not be silently mixed in comparisons. Display comparisons on the same basis.
- The photographed numeric stats already include any displayed authentication changes. Keep native stats and authentication separate before importing into the runtime `GearItem` format.
- For blue numeric authentication, subtract its displayed contribution from native stats, then store that contribution once as authentication. In-game negative Arrow speed corresponds to positive internal Arrow reduction.
- Void Elegant Business Backpack shows Luck103, previously80, with Focused+28% to Luck. Preserve native80 and observed authentication delta23; do not add28 percentage points or count the change twice.
- Mutated Luck is a Head authentication that sums one bonus for each worn accessory's strongest eligible mutation: Silver5, Gold10, Corrupted15, Diamond20, Gem25, Chrome30, Hologram35, Void40, Secret45, Rainbow60, Onyx75 Luck.
- Mutated Luck uses only the strongest eligible mutation on each accessory, even though display selection considers combined mutation value. Diamond+Silver therefore contributes the Diamond bonus, not Diamond plus Silver.
- Emerald's Mutated Luck contribution is not established by the supplied table. Unknown contributions must remain explicitly unverified, not silently become confirmed zeroes in a safety proof.
- Condition and grading metadata must remain as observed. Do not invent missing digits, unpublished grading odds or stat multipliers.

## Display collection

1. Worn setup takes priority: never remove a necessary worn piece solely to display it.
2. Group by actual gear type/base name and slot. Different stat rolls, grades and mutation prefixes are copies of the same type, not separate collection types.
3. Reserve **one separate best remaining copy** per type for physical display. A worn copy does not also satisfy the display requirement.
4. Prefer the **best combined mutation value**, including stacked mutations. Do not simply select the highest single mutation tier or highest total item price.
5. For comparable, verified value multipliers, combine the mutation stack. Example: Diamond8 × Silver2 =16 outranks Chrome12 for display. These are value multipliers, not Luck bonuses or drop probabilities.
6. Use the higher observed item value to break equal mutation-stack choices. Price must not replace mutation ranking when grade/condition could explain a price difference.
7. Unverified stack multipliers or missing tie-break prices leave the affected choice provisional. Retain competing copies until resolved; never fabricate a multiplier or value.
8. Keep slot locks and quality/condition labels distinct from mutations. Exclusive/Limited labels or Mint condition must not automatically gain invented multipliers.
9. Diamond+Silver Steampunk Goggle is the reviewed display choice; the Chrome copy stays in storage for its useful Luck/Arrow combination.
10. Chrome Tactical Vest is reserved for wearing. Emerald Tactical Vest is the reviewed remaining display candidate; its uncertain mechanics must not justify removing another useful copy.
11. Jellyfish Wristband has no spare photographed copy. Wear the existing Diamond copy; another physical copy is needed to display that type separately.

## Storage chest

- Keep duplicates that could be useful in current, contextual or future best auction setups.
- Protect Luck/Arrow/Zone trade-offs, useful authentications, mutation benefits through Mutated Luck, worthwhile certificate targets and plausible grading potential.
- A cheap or lower-mutation copy is not automatically disposable. Grade, price and visual rarity do not substitute for its actual stats.
- Keep any item without a sound disposal proof. Not winning a sample of future scenarios is not proof of irrelevance.
- A display copy remains retained and may be reassigned to wear/storage if a later setup changes. Recalculate the display reserve when worn gear changes.

## Safe disbanding

An item can be recommended only if all applicable requirements hold:

1. It is not required for the worn setup or the separate display collection.
2. It has no unresolved information that could affect its safety and is not owner-locked.
3. It is not protected as a useful current/future alternative or meaningful certificate/grading candidate.
4. A specific **retained** same-slot replacement proves it unnecessary under the auction policy. Check both observed and native auction stats, authentication identity, mutation Luck contribution and grading potential.
5. For the reviewed seven copies, the retained witness has componentwise no-worse current/native auction stats, no-worse Mutated Luck, matching authentication, a compatible Focused target and equal/lower recorded grade. The witnesses' Walkspeed differences do not change Focused targeting in these seven pairs.
6. Disposal must remain safe when all recommended copies are removed together. A witness must not itself be discarded without an independently retained replacement.
7. Sampled loadouts support a proof but never replace it. Do not claim to guarantee unknown future game mechanics.
8. Sort eligible copies by their **current displayed item value, lowest first**. This is not the amount of a guaranteed disband reward.
9. Unknown prices remain unknown and prevent an unqualified complete price ordering. Do not assign zero to an unpriced item.
10. Recommendations never automatically delete inventory records or perform in-game actions. Keep all80 until an actual owner-confirmed removal.

The reviewed order is Tactical Mask$2,948.82; Green Ghillie Vest$3,601.80; Tactical Mask$3,919.86; Bullet Sash$8,862; Military Stopwatch Wristband$11,215.26; Tactical Vest$15,872.76; Spec Ops Fedora$125,504. Exact copy identifiers and retained witnesses are in the assessment.

## Unknown evidence and provisional totals

- IMG_8407 is Witch Robe but shows the previous Tactical Vest tooltip. Do not transfer those stats to Witch Robe.
- IMG_8420 is Safe Wristband$700.44 but shows the previous Pickle Wristband tooltip. Do not transfer those stats.
- Keep both items; exclude their unconfirmed stats from any claim of a complete-inventory optimum. Missing condition digits alone do not erase otherwise readable stats.
- Current plan: **3 worn, 54 display, 16 storage, 7 recommended disbands =80**. One display copy and one storage copy still require stat verification. The new Safe Wristband's unspecified mutation/value can also affect its eventual display tie-break.
- Confirmed setup: Spec Ops Dominus(-80% Arrow,+34% Recovery), Chrome Tactical Vest(+110 Luck,Golden Hour), Diamond Jellyfish Wristband(-32% Arrow,+54 Luck).
- Confirmed totals under routine assumptions: **112% Arrow reduction,264% gear Luck,0% Bid Zone**. The previously recorded four-gavel arrangement adds52 charm Luck, giving316 total; it was not re-verified in the78 photos.

## Certificates, gavels and recording policy carried forward

- Prefer worthwhile improvements with modest risk; no paid certificate refills/rerolls. Compare keeping the current bonus against the full resulting setup, including losses from replacing existing authentication.
- Honour certificate family, tier and slot restrictions, including Premium, Limited and Carnival. Unknown odds/strengths stay unknown; do not present assumed equal outcome odds as published probabilities.
- Confirm a certificate record before deducting one owned unit, updating its item and recording history. Editing history alone must be clearly distinguished from correcting current gear.
- Recommend four owned gavels with their actual attached charms. Keep proposed rearrangements separate until the owner records making them in game.
- Clover adds percentage points on top of the gavel's mutation percentage:101+28=129.
- Mosaic counts itself; only the best placed Mosaic counts, granting its percentage for each different placed charm type. Previously recorded13 ×4=52 general Luck.
- Preserve existing gavel/charm records, certificate quantities, owner locks, history and subsequent corrections when implementing this inventory snapshot. Do not reset them merely because the accessory inventory is now80.
