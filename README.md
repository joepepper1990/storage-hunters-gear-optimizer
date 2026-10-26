# Storage Hunters Optimiser

Mobile-first offline PWA for optimising owned equipment in **Storage Hunters: Open World**.

## Current model — Algorithm 2.0

Algorithm 2.0 consolidates gear ranking, specialist loadouts, retention and certificate decisions around one shared Head × Back × Wrist evaluator.

The app exhaustively evaluates exactly **one Head + one Back + one Wrist**. A physical accessory is **not assigned to one exclusive role**: the same item can legitimately be the best choice in Main Auction, Drink Prep, Grading and Shop / Idle at the same time.

### Loadouts

1. **Main Auction** — absolute priority. Uses displayed Luck, Bid Arrow reduction up to the user's 75% sweet spot, Bid Zone Width and Bid Recovery, plus supported dynamic/contextual Luck effects.
2. **Drink Prep** — temporary set for consuming an Energy Drink; optimises Energy Drink Time and Overcharged, then the user switches back to Main Auction.
3. **Grading** — temporary set for Grade Re-Roll. The user owns Lucky Grading, so grading calculations use the Lucky Grading distribution.
4. **Shop / Idle** — optional selling set using Tip Chance and NPC Offers Bonus.

The engine also evaluates **Day / Night / Rain** Main Auction variants internally for Sunny, Nocturnal and Raindrop. There are intentionally no dedicated Heavy Hauling or Time Capsule gear loadouts.

## Retention and SAFE TO DISCARD

Gear retention is calculated from the union of all relevant loadouts and uncertainty scenarios.

- **EQUIP** — part of the current best Main Auction trio.
- **KEEP** — used by a relevant specialist/context loadout, tied-optimal alternative, or manually favourited.
- **PROTECTED / UNKNOWN** — a genuinely unresolved non-zero-value effect could change the decision.
- **SAFE TO DISCARD** — not used by Main Auction, Day/Night/Rain, Drink Prep, Grading or Shop / Idle, and is then proven redundant by the same-slot dominance analysis.

An item shown as **SAFE TO DISCARD cannot simultaneously be a member of a relevant loadout**. Regression tests enforce that invariant.

F-tier effects for this profile do not create false protection merely because their exact mechanics are unknown. This includes Connected, Club Pact, Auto X-Ray, Second Chance, Steady Hand and Haggler.

## Main Auction rules

- Displayed Luck is kept **linear**. The app does not claim to know the hidden Luck → rare-drop/mutation probability formula.
- Combined Bid Arrow reduction is useful up to **75%**. Additional reduction is treated as wasted rather than given an invented gameplay penalty.
- Bid Zone uses the configured diminishing utility curve.
- Specialist-only stats such as Energy Drink Time, NPC Offers, Tip Chance and Walkspeed do not distort the Main Auction trio.

### Dynamic effects

Supported by the shared model:

- **Mutated Luck** — calculated from the actual mutations on the equipped Head + Back + Wrist trio.
- **Droughtbreaker** — evaluated across low / central / high stack scenarios (0 / 3 / 5 stacks).
- **Golden Hour** — evaluated across low / central / high session states (0 / 50 / 100 Luck).
- **Luck Frenzy** — roll magnitude is known; uptime is not published, so the app uses low / central / high sensitivity scenarios rather than presenting one uptime as a game fact.
- **Sunny / Nocturnal / Raindrop** — evaluated as Day / Night / Rain contexts rather than fake average uptimes.

Focused remains protected where its exact numerical formula could materially change a discard decision.

## Certificate decisions

The Certificates screen uses the same Main Auction and specialist evaluators as the Gear and Optimise screens.

For each owned certificate, every eligible target is evaluated by:

1. retaining the current fully-authenticated inventory as the baseline;
2. replacing the target's current authentication with each modelled outcome/roll;
3. re-optimising the complete Head × Back × Wrist inventory;
4. separately re-optimising Day/Night/Rain, Drink Prep, Grading and Shop / Idle;
5. aggregating improvement/downside probabilities and confidence.

Displayed metrics include:

- chance Main Auction improves;
- chance of a meaningful Main improvement;
- expected Main change;
- chance Main gets worse;
- average gain/loss;
- percentile outcomes;
- current authentication value at risk;
- Main Fit;
- secondary contextual/specialist impact;
- model confidence.

Recommendations are **USE / CONSIDER / HOLD / DO NOT USE**. HOLD is a first-class decision.

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

Unknown effect-selection odds and certificate-grade transforms are not presented as official probabilities. Neutral priors, sensitivity analysis and recorded roll history are used instead.

### Lucky Grading

Lucky Grading is enabled for this profile. Grade Re-Roll therefore uses the Lucky grading model rather than valuing removal of Replica risk the user already avoids.

## Roll learning

Certificate roll history stores the previous and replacement authentication and can also record the owned certificate ID and star grade. Observed outcome counts update outcome estimates. Known-range effects begin from deterministic coverage of the legal range and increasingly incorporate same-grade observed roll values as data accumulates.

## Verified accessory inventory

The schema-9 inventory reset captured the user's verified **22 accessories** from 26 October 2026:

- 11 Head
- 6 Back
- 5 Wrist

Schema 10 is non-destructive: existing schema-9 gear, certificates, roll history, vehicles and trophies are preserved while Algorithm 2.0 metadata/settings are added.

## Other optimisers

### Gavel Trophies

The Gavel optimiser supports up to four powered trophies, overall optimisation, mutation-specific specialist sets and retention. Its retention design is also used as the model for gear: an item needed by any enabled specialist set is retained.

### Vehicle

The vehicle optimiser evaluates Spoiler × Exhaust × Wheel Stack × Trailer combinations using the documented local formula model, including empty equipment slots and the configured vehicle-capacity multiplier.

## Gear scanner

**Gear → Scan screenshot** performs OCR locally in the browser with Tesseract.js and opens the normal Gear editor for review. A scan never writes directly to inventory without user confirmation.

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

Historical design/audit files under `docs/` retain their original dates and model versions for traceability.
