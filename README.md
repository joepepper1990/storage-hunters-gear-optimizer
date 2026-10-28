# Storage Hunters Optimiser

Mobile-first offline PWA for optimising owned equipment in **Storage Hunters: Open World**.

Version 2.5 is a minimal redesign: every everyday screen gives an answer, not an explanation.

## Screens

1. **Best setup** (landing page) — what to equip for each activity: Auction (Neutral / Day / Night / Rain; identical sets share one card), Drink Prep, Grading, Shop / Idle, and up to the four enabled Gavel slots. One piece may appear in several sets.
2. **Certificates** — a numbered queue: certificate (tier, grade, mutation), target item, chance of improving that row's goal, and **Record result**. A compact **Hold** section lists certificates with no qualifying opportunity. Owned batches, an optional history drawer and the live Authenticator prompt answer (Accept / Reroll / Reroll number) live here too.
3. **Discard** — one grouped, selectable list of gear and Gavels proven safe to remove, with review and explicit confirmation. Nothing is deleted automatically.
4. **Inventory** — gear, Gavels and certificates: add, edit, duplicate, favourite, delete and importing screenshots in bulk with side-by-side review.
5. **Preferences** — 0–10 importance sliders per activity, Gavel slots and mutation values, backup / restore, appearance, and a collapsed maintenance area (model values, certificate outcome catalogue, reset).

## Model

The app exhaustively evaluates exactly **one Head + one Back + one Wrist** with one shared evaluator used by Best setup, certificates, dominance and retention.

### Auctions

- Displayed Luck is kept **linear**. The app does not claim to know the hidden Luck → rare-drop/mutation formula.
- **Being inside the Bid Arrow band comes first.** A set with **65–80%** combined Bid Arrow reduction outranks every other set, whatever their Luck. Above 80% comes next, then below 65%. Every value from 65% through 80% is equally ideal. Signed in-game Arrow values are entered as shown.
- Among the sets in the same Arrow tier, the weighted score decides: as much Luck as possible, plus Bid Zone and Bid Recovery by their weights. When no set can reach the band, Arrow progress towards 65% is weighted with the rest.
- Moving into or out of the band counts as the largest possible change for certificate and reroll advice. A piece is never offered for discard in favour of one with less Arrow, so a replacement can never drop a future set below 65%.
- Bid Zone uses the configured diminishing curve; Bid Recovery is linear.
- Mutated Luck, Droughtbreaker, Golden Hour, Luck Frenzy and Sunny / Nocturnal / Raindrop are evaluated as before (dynamic sensitivity states and Day / Night / Rain contexts).

### Specialists and priorities

Drink Prep (Energy Drink Time), Grading (Grade Re-Roll under the owned Lucky Grading pass) and Shop / Idle (Tip Chance, NPC Offers) each have a priority. After Main Auction, certificates consider specialists in priority order (default Drink Prep → Grading → Shop / Idle); a lower priority can only win when every higher one is neutral. A priority of **0 ignores** that activity everywhere: no set, no retention protection, no certificate goal.

Weights are percentages that add up to 100 within each group (Auctions, and Shop / Idle Tip and NPC). Moving one rebalances the others in its group in proportion, and other groups never change. Priorities stay on a 0–10 scale, because they set an order rather than a share. Engines use only the ratios within a group, and stored values keep their overall size, so custom values stay exact until a weight in that group is moved. Reset changes only its own section.

### Retention and Discard

An item can be discarded only when it is not used by any relevant set, is not a favourite, has no unresolved effect and is beaten stat by stat: another item in the same slot must be at least as good on every stat that matters (Luck, Arrow, Zone, Recovery, and Energy, Tip, NPC and Grade Re-Roll for activities not set to 0, plus mutation for Mutated Luck) and better on at least one. Stats set to 0 never save an item, and no trade-off between stats can make one redundant. Unknown or unmodelled effects (Focused, Fossil Finder, Safecracker, Exhibitor, Anti-Gravity Field, Rush and any custom effect) are protected **whatever the authentication kind**, including Limited. Items targeted by the current certificate queue are never offered for discard, and gear discards stay locked while either analysis is recalculating.

F-tier effects for this profile (Connected, Club Pact, Auto X-Ray, Second Chance, Steady Hand, Haggler) and the deliberately unmodelled Heavy Hauling / Time Capsule effects (Featherweight, Temporal Split) do not create protection by themselves.

### Certificate queue

Each certificate target is evaluated against the item's current authenticated state by re-optimising the whole inventory for every modelled outcome. The queue:

- uses no more rows than owned certificates, shows each target at most once and never assumes an earlier row's unknown result; it is rebuilt after every result, inventory change or preference change;
- ranks rows by verdict, then goal (Main Auction first, then Day / Night / Rain, then specialists in priority order), then evidence coverage and the goal's own conservative gain — item IDs only break exact ties;
- shows the full chance of improving the row's goal only when every outcome is resolved, as a range when numerical error matters; otherwise it shows **Unknown** with a resolved lower bound. 0% and unavailable are distinct.

### Current Limited outcomes

Confirmed from the user's in-game certificate screen:

| Slot | Effect | Range |
|---|---|---:|
| Head | Auto X-Ray | 3–30% |
| Head | Grade Re-Roll | 5–25% |
| Back | Featherweight | 3–20% |
| Back | Luck Frenzy | 10–110% |
| Wrist | Second Chance | 4–33% |
| Wrist | Steady Hand | 4–33% |

The **Authentication Outcome Catalogue** is the live source of truth for certificate EV. Enabled state, exact certificate tier, min / typical / max, confidence and user-assumed relative-weight class all feed the model. Current built-in rows default to MEDIUM relative weight, so the untouched outcome prior is neutral. Changing that class is an explicit user assumption, not a claim about hidden game odds.

Ripped and Wooden are modelled as the same outcome pool. Confirmed Ripped ranges use their narrower values; Ripped exclusives that are not yet confirmed remain enabled with unresolved range/confidence rather than being treated as impossible.

Unknown certificate-grade transforms are not presented as official probabilities. Sensitivity analysis and exact-tier roll history are used instead.

### Lucky Grading

Lucky Grading is enabled for this profile. Grade Re-Roll therefore uses the Lucky grading model rather than valuing removal of Replica risk the user already avoids.

## Roll learning

Certificate roll history stores the previous and replacement authentication, exact owned certificate tier/ID and star grade. Wooden and Ripped observations remain separate. Observed outcome counts update effect-selection estimates.

For roll strength, the configured min / typical / max remains the prior model and is never overwritten by a single observed roll. Empirical samples progressively outweigh that prior using a decaying prior mass, so a large real sample converges toward the observed distribution instead of staying permanently 50% prior / 50% empirical.

## Verified inventory

Schema 15 is a one-time replacement from the user's complete 27 October 2026 screenshots:

- **29 accessories:** 16 Head, 7 Back and 6 Wrist (the 26 October 22 plus seven more).
- **9 certificates:** 2 Limited, 1 Premium and 6 Wooden.
- **18 Gavel Trophies:** fourteen in inventory and four on displays.

Anything else stored is removed. A stored record that matches a screenshot keeps its ID, favourite and created date, so roll history still points at it. Settings and roll history are untouched, and explicit backup restores keep their own inventory. Vehicles are no longer modelled; vehicle parts, trailers and vehicle settings from older versions are dropped.

Schema 14 was an earlier one-time Gavel replacement: 15 Gavel Trophies (eleven in inventory, four on displays). Any other stored Gavel is removed; a stored Gavel with identical rolls keeps its ID and favourite. Everything else is untouched, and explicit backup restores keep their own Gavels.

Schema 13 is non-destructive: existing schema-9+ inventory, certificates, roll history and trophies are preserved while the authentication catalogue is migrated to exact Wooden / Ripped / Premium / Limited tiers. Schema-10 built-in rows inherit known tier ranges without losing observed samples.

## Other optimisers

### Gavel Trophies

The Gavel optimiser equips the best three or four (gamepass) powered trophies. Retention keeps any trophy needed by an enabled mutation-specific maximum set. Any other Gavel is offered for discard only when another Gavel has at least the same boost on every one of its mutations (switched-off mutations aside) and a higher overall value.

## Grading

A regrade drink removes an item's grade; grading then gives 1, 2 or 3 stars at random (Remove Replica rules out failures). Each star raises the item's base stats by an amount the game does not publish, and the odds of each result are taken as equal.

**Best setup → Regrade** lists items in the current best sets that are worth grading: ungraded first (grading can only help), then 1★ (a regrade can only keep or raise it), Main Auction pieces before specialists in priority order. 2★ pieces are named as an even gamble (1★ or 3★); 3★ pieces are left alone.

What a star is worth is learned: importing a screenshot of a regraded item recognises it (same item, every stat changed by one factor), updates it, lists each change and records the change. From those records the app estimates the value of a star (displayed = base × (1 + k × stars), median over regrades) and shows the average stat change a regrade would bring.

Schema 16 fills in the star grades the 27 October screenshots showed, once, without overwriting a grade already recorded. Gavel grades are recorded but not yet used: whether a star raises a Gavel's boosts is not known.

## Screenshot import

**Inventory → Import screenshots** takes several in-game inventory screenshots at once and reads each one locally in the browser with Tesseract.js. Only the item panel is read, in separate regions: the star grade, the stat lines by colour (green base stat, red harmful stat, blue authentication, grey description) and the name with its [Tag] prefixes and condition. Prices are ignored.

Each screenshot is shown beside editable fields with **Approve** or **Skip**; nothing is saved until approved.
- Gear and Gavels that match the inventory (same slot, name and base stats, or the same boosts) are **updated in place**, and the card lists exactly what would change (condition, stars, mutation, effect). Otherwise the item is added as new.
- A certificate adds one, showing how many of that kind are already owned.
- The slot comes from the inventory or the item name; an unknown name must have its slot chosen. Focused still requires the base stats to be checked.
- A stat's direction comes from its colour, so a misread minus sign cannot flip it. Everything after the authentication line is its description; an effect shown without a number takes it from there (Droughtbreaker).

The layout is fixed by the game, so the regions are fractions of the screenshot. OCR can still misread digits (for example 7.7 as 7), which the change list makes visible before approving.

## Cloud sync (optional)

**Preferences → Cloud sync** keeps the data in the user's own Supabase project, so every device signed in to it has the same inventory, settings and history. Nothing goes anywhere else.

The owner's project (storage-hunters, London) is already set up and pre-filled in the app: tap Connect, then create an account or sign in. To use a different project: run the setup script shown in the app (SQL Editor; it creates one table with row-level security so each account reaches only its own row), set Authentication → URL Configuration → Site URL to the app's address, then paste the Project URL and the public anon key into the app. Sign in with email and password (a magic link would open in the browser rather than an installed home-screen app). The project URL, key and sync state are kept per device and are never exported.

How it syncs: the whole data set is one row with a revision number. Each device remembers the revision and a fingerprint of what it last synced. A change on one device uploads (only if the cloud is still at that revision); a change made elsewhere downloads and is checked like a restored backup; if both changed, or a new device finds existing cloud data, the app asks which to keep and overwrites nothing until then. Sync runs 2 s after a change, when the app is reopened, and on demand. The Supabase library is only downloaded once sync is set up.

## Data and privacy

There is no app backend or remote account database.

- Primary storage: IndexedDB.
- Emergency recovery mirror: localStorage where quota allows.
- JSON backup/restore.
- Gear CSV import/export.
- Screenshot OCR runs locally in the browser.

## Development

Requires Node 22+.

```bash
npm install
npm test
npm run build
```

The production build runs TypeScript compilation followed by the Vite/PWA build.

## GitHub Pages

Every push to `main` runs regression tests and a production build before deployment.

Live URL:

https://joepepper1990.github.io/storage-hunters-gear-optimizer/

## Evidence boundaries

The app distinguishes player preference/model assumptions from confirmed game mechanics. In particular, it does not claim exact hidden odds for:

- displayed Luck converting to rare-item/mutation probability;
- Wooden exclusive/basic outcome weighting;
- Limited/Premium outcome weighting;
- certificate star-grade distribution shifts;
- Luck Frenzy uptime;
- exact Focused formula.

Where those unknowns can change a recommendation, confidence is reduced and the app should prefer a conservative HOLD/KEEP decision rather than inventing precision.

## Reset behaviour

**Clear all local data** and the storage-recovery **Start empty** action now create a genuinely empty workspace: no gear, certificates, roll history or trophies. The default algorithm/settings catalogue remains available so the empty workspace can be rebuilt manually.

Historical design/audit files under `docs/` retain their original dates and model versions for traceability.
