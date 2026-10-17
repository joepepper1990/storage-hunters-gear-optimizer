# October 17, 2026 — live-game mechanics and screenshot inventory review

## Evidence levels and corrections

**Directly observed in user screenshots:** Seven distinct vehicle-part rolls; twelve Gavel rolls (including two in each shelving screenshot); the Wooden Certificate of Authenticity (Epic, 56% condition, $1,648). Conditions absent from a screenshot remain unknown, never invented. The new Manta Spoiler has **-16% Vehicle Speed / +15% Vehicle Acceleration**, which is *not* the older saved +26% Speed / -16% Acceleration Manta roll.

**Corroborated community guide:** Gavel Trophies can display **up to 3 mutation-chance modifiers per physical Gavel**; **3 powered Gavels normally** and **4 with Extra Gavel Trophy gamepass**. Reports say a single Gavel mutation chance bonus can reach +250%. Multiple powered Gavels' boosts for the same targeted mutation add when reporting the combined displayed boost. Treat the displayed +% as relative chance boosts, **not base drop probabilities or extra sell-price percentages**.

References:
- https://www.storagehuntersopenworldwiki.wiki/guide/storage-hunters-open-world-trophy-guide
- https://www.storagehuntersopenworldwiki.wiki/items/storage-hunters-open-world-gavel-trophy
- https://storagehunters.fandom.com/wiki/Gavel_Trophy

**Separate item sell-value mutation mechanic:** The Fandom wiki and several July–October guides describe *additive* stacking of item value-mutation multipliers. Some competing fan websites describe *multiplicative* stacking and use conflicting examples. The Gavel optimiser **does not** attempt to compute item sale values or mutation proc odds. It uses the community Relative Added Value Boost heuristic (sum of each Gavel's mutation bonus % times an editable sell-value multiplier). Exact underlying base proc rates are not published. Consequently no claimed true-cash expected value or 100%-correct game probability.

References:
- https://storagehunters.fandom.com/wiki/Mutations
- https://storagehunters.fandom.com/wiki/Gavel_Trophy
- https://storagehuntersroblox.com/blog/how-mutation-multipliers-stack
- https://storage-hunters.wiki/mutations (CONFLICTING stacking methodology)

**Wet correction:** Older app carried **1.4×** as a placeholder relative mutation weight; Fandom and other corroborating community tables use **6×**. Fresh defaults use 6×, and the schema-6 migration updates the exact historical 1.4 default. Other custom weights are retained. Wet +% Gavel *chance* boosts are separate from the sell-value 6×.

**Mutation catalog:** Core Silver, Gold, Corrupted, Diamond, Gem, Chrome, Hologram, Void; weather Moonlit/Firefly/Wet/Shocked; Tiny/Huge; Time Capsule, police, Sandstorm, mine, Cargo Train, Autumn variants; user-editable weights. Dirty/Pure/Spotless/Fossil, cauldron Ruby/Titanium are available as **disabled** reference entries because their contexts do not automatically qualify them as regular Gavel mutation rolls. Community values may be disputed for some seasonal mutations; adjust individual weights rather than inventing base probabilities.

**Premium certificate:** Community/player sources describe upgrading Wooden Certificate of Authenticity with 150 Diamonds at the Premium Certificate Shop near Lucky Beach. User confirmed spelling **Club Pact** (not Club Packed); the old alias stays readable for backups. Head: Mutated Luck; Back: Drought Breaker, Golden Hour; Wrist: Club Pact, Temporal Split. No official roll odds or reliable linear stat valuation for dynamic perks. Premium outcomes are logged separately, and an automated 'best Premium reroll target' is intentionally not fabricated.

References:
- https://allthings.how/storage-hunters-qol-update-onyx-mutator-and-nuclear-meltdown-explained/
- https://www.reddit.com/r/StorageHuntersRoblox/comments/1wkxp4y/club_luck_question/

## Data migration and safety

Schema-6 upgrade from v1.7 brings 7 vehicle items, 12 trophies and the screenshot Wooden Certificate to a saved phone inventory without resetting gear, vehicles, trophies, settings or certificate rolls. Equivalent existing entries are matched on full signed numeric rolls/complete modifier multiset, **not just names**. Distinct real rolls remain separate. Existing entries with identical stats are **not automatically deleted**, because multiple physical items may have identical rolls. Migration runs once, so deliberate removals are not reintroduced on every launch. Test backs up JSON export/import and prevents duplicates on repeat loads.

For new installations, both the v1.7 verified 14 gear records and the October vehicle/Gavel/certificate items are preloaded. Gavel capacity defaults to 4 for this user's previously chosen gamepass arrangement; the in-app setting supports standard 3. Condition and metadata are informational; no speculative effect on equipment stats is assumed.

## Remaining unknowns

- True native mutation probabilities and whether +% trophy effects are uniformly linear across events.
- Exact odds for each certificate effect and Premium-specific numerical outcome distributions.
- Conflicting online claims about item mutation stack sell-price combination and some event mutation value multipliers.
- Live-game confirmation of any future caps, event-specific restrictions or post-Oct-17 patches.

Run CI tests, production build and GitHub Pages deployment check before considering this release shipped.
