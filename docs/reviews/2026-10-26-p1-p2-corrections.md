# Certificate integrity follow-up

Base: `74109ddbf8ad4a693e87961051049bc961b65891` (P1 corrections already merged).

## Policy

- Dashboard, Gear EQUIP and Optimise use the robust zero-state Main baseline. Central/high states are sensitivity alternatives.
- Same-verdict certificate targets rank by resolved probability coverage before conditional expected utility, then deterministic item ID.
- Conditional expected values and percentiles describe resolved branches only. A complete expected value is unavailable when any outcome remains unresolved. A conservative full-Main lower bound allows a 100% utility loss on unknown branches; no finite upper bound is invented.
- Empirical support aggregates identical observed values with their actual frequency. Distinct values and rare tails are retained without quantile compression.
- Outcome-selection prior strength is a policy assumption, not calibrated game odds. Half/double-strength sensitivity is reported separately from the central estimate.
- Grade/mutation mismatches do not become legacy model-only evidence merely because exact evidence was downweighted.
- Wooden conversion remains an indicative gear comparison. No economic recommendation is made without resource affordability, diamond valuation and conversion-grade evidence.
- Persistence envelopes have backward-compatible monotonic revisions. Revision allocation happens when a snapshot is captured, before queued writes, so delayed IndexedDB writes cannot replace a newer pagehide mirror. Legacy envelopes remain readable.

## Preservation

No inventory reseeding, reset, roll deletion, certificate consumption or configuration migration is introduced by this update. Existing schema 13 data remains schema 13. Snapshot metadata is outside user data.

## Verification

Regression counterexamples were run against the old behaviours in PR #15 before the fixes. Final test/build and merge/deployment evidence is recorded in GitHub Actions.
