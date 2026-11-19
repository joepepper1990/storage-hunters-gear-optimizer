# Certificate tier audit

The owner reported that the app always recommended Wooden certificates.

## Research

- Owner-supplied in-game Mutated Luck screenshot confirms the mutation contribution table, highest mutation per worn item and Head-only authentication.
- Premium update coverage: https://www.youtube.com/watch?v=MAkdFp0EH6w (Premium at5:22, Droughtbreaker6:33, GoldenHour6:53, MutatedLuck7:20).
- Premium/GoldenHour reference: https://storagehunterswiki.com/guides/qol-update-guide (maximum100 Luck; secondary source).
- Player confirms Premium replaces an existing bonus rather than stacking: https://www.reddit.com/r/StorageHuntersRoblox/comments/1w8eji1/premium_certificate_of_authenticity/
- Limited passives, including temporary LuckFrenzy: https://techwiser.com/storage-hunters-open-world-accessories/

Older guides conflict and do not establish current roll probabilities. No new odds or strength ranges have been invented. LuckFrenzy remains conditional; its uptime scenarios are assumptions, not measured game frequencies. GoldenHour uses the owner's selected default maximum; its charging-rate number does not change that maximum.

## Reproduced defects and corrections

1. Owned GoldenHour charging-rate values (e.g.1.2/min) made its future result branch unresolved before the fixed-mechanic check. Fixed/state-controlled effects now resolve before observations are consulted.
2. Clean-item Premium MutatedLuck and Limited Back upgrades were downgraded solely because no unaffected backup existed. An explicit nonnegative-effect pool can now prove preservation of native auction stats. Existing blue bonuses still require replacement-loss checks.
3. Recommendation sorting used assumed improvement probabilities. Safety verdict comes first, then the best resulting Arrow/Luck/Zone set. A common certificate is conserved only when opportunities are otherwise equal.
4. Best-roll selection could pick the first sampled Arrow overshoot (125.2) instead of a supported exact target100. It now shares the resulting-set comparison.

Certificates now exposes the evaluated effect and target for each owned tier. This does not force Premium or Limited to win when Wooden offers a better result or the other tiers have no owned quantity.

## Regression evidence

New tier tests failed before the fixes: GoldenHour unresolved, safe MutatedLuck/LuckFrenzy downgraded, assumed odds overriding a stronger set, and125.2 Arrow chosen instead of100. Tests also preserve the guard against overwriting a valuable Sunny bonus.

## Starting-inventory check

A one-off audit of the owner's supplied starting inventory (not later browser-only edits) found:

- Wooden: an Arrow result on Autumn Fox Wristband can produce an exact100 Arrow /388 gear Luck set.
- Premium: Mutated Luck on the Chrome Steampunk Goggle can improve the99 Arrow set to204 gear Luck.
- Limited: Hold at this target under the checked scenarios; no qualifying improvement was found.

These are possible resulting sets, not promised rolls or measured probabilities. They explain why Wooden can legitimately remain first after the bugs are corrected.
