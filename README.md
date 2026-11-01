# Storage Hunters Optimiser

Mobile-first offline PWA for owned equipment in **Storage Hunters: Open World**.

## Current app

- **Home:** one Best Set, the next certificate opportunity, equipment counts and regrading suggestions.
- **Equipment:** Best Set, Keep, Safe to Discard, gear editing and Gavels. Removals require selection and confirmation.
- **Certificates:** owned quantities, modelled opportunities, recording results, history and an optional live Authenticator reroll prompt.
- **Settings:** appearance, backup/restore, optional cloud sync and maintenance. The optimisation policy is fixed; imported algorithm overrides are reset to that policy.
- **Add equipment:** manual entry and bulk screenshot import with review before saving.

## Best Set calculation

Every Head × Back × Wrist trio is enumerated. With the confirmed inventory this is 15 ×9 ×4 =540 trios.

1. Rank by distance from **70–90% combined Bid Arrow reduction**, inclusive. Every in-band set has distance 0; outside the band, nearer wins.
2. At equal distance rank by the shared weighted utility: linear Luck, Arrow capped at 70, diminishing Zone and Energy, and linear Recovery.
3. Exact ties use stable item IDs. Context-specific sets activate Sunny, Nocturnal or Raindrop.

Policy weights are Luck 1, Arrow 1, Zone 0.6, Energy 0.3 and Recovery 0.2. Energy has full value through 50, a tenth value from 50 to 100, and no extra value above 100. Zone has full value through 30,0.75 from 30 to 60, and 0.5 thereafter. These are player-policy preferences, not hidden game formulas.

Base stats and authentication are separate. The Void Elegant Business Backpack has base Luck 80, Focused 28% and an observed 23-point Luck delta, giving displayed 103. Replacing Focused removes that delta. Signed in-game Arrow−45% is stored internally as 45% reduction.

The UI distinguishes **Item Luck** from **Modelled Luck**. The current trio has 232 numeric item Luck; the mutation model adds 60, yielding 292. Other global game boosts are excluded. Mutated Luck currently uses the highest recognised mutation on each accessory; its contribution table and that rule remain model assumptions requiring game evidence.

## Conservative discard

An item is offered only when it is outside all protected current/contextual/dynamic sets, is not favourited or unresolved, is not a certificate-queue target, and has a proven same-slot replacement.

The proof requires equal effective **and native Arrow**, no worse native/effective relevant stats, no worse mutation contribution, compatible known dynamic authentication, and a strict improvement. Equal Arrow avoids both falling below and overshooting the band. Componentwise checks remain valid through Energy/Zone saturation. Native checks preserve alternatives when a future certificate replaces numeric authentication.

The future-equipment sweep supplies Keep reasons only. Missing its sampled values or winning in a narrow range never proves an item disposable. Unproven alternatives stay Keep. Strict replacement chains preserve a maximal alternative when several proven-redundant items are removed together.

All proofs are relative to the current model and policy; unpublished mechanics or future game changes are not guaranteed. Unknown effects are retained. Gear removal is blocked while its analysis or certificate targets are stale.

## Certificate calculations and uncertainty

Each possible result replaces the target's existing authentication and re-optimises the whole inventory. Unaffected trios are reused exactly. Main, Day, Night and Rain are evaluated; a gain in one does not hide a loss in another.

- The canonical catalogue supplies outcome pools. **Equal effect probabilities are an explicit assumption**, not independently verified official odds.
- Recorded exact-tier/grade/mutation observations inform strength only. Other evidence is downweighted or excluded. Unknown ranges and mechanics remain unresolved.
- Numeric prior intervals carry exact prior probability masses. Endpoint evaluations bound monotone regions. An Arrow interval crossing an unproved ranking/band region contributes its entire mass to uncertainty, even if no midpoint sees a gain or loss.
- Improvement lower/upper bounds and downside upper bounds include interval uncertainty. Unknown effects count as possible harm unless a complete unaffected set proves no loss in every auction context.
- Cautious/central/favourable are selected dynamic scenarios, not statistical confidence intervals. Scenario ranges and unresolved strengths are labelled separately.
- USE requires conservative safety and improvement thresholds. CONSIDER can identify uncertain upside; HOLD remains a valid zero-action choice.
- Paid number rerolls use the conservative improvement lower bound, not the rounded midpoint estimate. Advice compares gear benefit and does not value 199 Robux on the user's behalf.

The queue never exceeds owned quantities, never targets an item twice and never assumes an earlier unknown result. It is rebuilt after results or inventory changes. Recording a result updates the item, consumes one certificate and records provenance. The active paid-reroll prompt is session-only and is never inferred from history.

Current Limited outcomes: Head Auto X-Ray/Grade Re-Roll; Back Luck Frenzy/Featherweight; Wrist Second Chance/Steady Hand. Real but unwanted effects remain in the probability pool and downside.

## Confirmed inventory and persistence

The owner confirmed 28 accessories on 1 November 2026:15 Head,9 Back and 4 Wrist. Schema 20 applies that equipment reconciliation once, retaining matching IDs, favourites and creation dates. It replaces Jellyfish Club Pact with Energy Drink Time 24%, adds Hologram Elegant Energy Drink Time 35%, and records the Void backpack's Focused delta.

Certificates, Gavels, history and grading observations are outside that equipment update. Explicit backup restores preserve their supplied inventory. Later edits are not reseeded. Older screenshot batches remain in source for historical migration fixtures.

Primary storage is IndexedDB, with a localStorage recovery mirror, revision/ancestry checks and stale-window conflict handling. JSON backups and gear CSV are available. Clear local data starts an empty workspace. Algorithm settings are reset to the app's fixed policy on load/restore; editable appearance and inventory data are retained.

Optional Supabase sync stores a complete data copy in one row per authenticated user under ownership RLS. Revision comparisons detect competing updates; conflicts ask which copy to keep. Connection/session metadata stays on the device. There is no custom app server.

## Screenshot import

Tesseract reads game-panel regions locally in the browser. Green/red base stats and blue authentication are kept separate. Each draft is reviewed before approval; Focused requires original base-stat confirmation. Matching records update in place; new rolls are added. OCR and same-name matching still require user review.

## Gavels and grading

Gavels use additive mutation boosts times editable mutation weights, with three or four active slots. Their score is a relative-value heuristic, not measured cash expected value or actual mutation probability. Specialist maxima, ties and favourites are retained.

Regrading tracks stars and learns proportional per-star growth from observations. Equal 1/2/3-star regrade odds are an assumption. Item condition is metadata; no speculative stat multiplier is applied.

## Development and deployment

Requires Node 22+.

```bash
npm ci
npm test
npm run build
```

The build runs TypeScript then Vite/PWA. GitHub Actions runs regression tests and the production build before deploying main to:

https://joepepper 1990.github.io/storage-hunters-gear-optimizer/

Historical audits under `docs/reviews` describe their dated versions, not necessarily the current policy.
