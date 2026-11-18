# Auction update implementation plan

Goal: Publish the owner's current inventory and simple auction-first recommendations.
Architecture: Keep the React/TypeScript app, storage safeguards and exhaustive trio search. Replace obsolete fixed-band policy with a persisted exact target and lexicographic auction ranking. Show top four gavels separately from editable inventory.

- [x] Replace seed inventory with 63 confirmed accessories and five gavels, preserving IDs/favourites on migration and explicit backup restores. Keep seven blue effects separate, all supplied grade changes and unknown grades honest.
- [x] Default Arrow to 100, Golden Hour to 100, Droughtbreaker to zero with controls. Rank closest Arrow, Luck, Zone, then secondary stats; expose faster/slower alternatives.
- [x] Model owned attached/loose charms, Mosaic self-count and best-only rule. Recommend top four as a heuristic mutation portfolio with a Luck-preserving Mosaic choice; label attachment costs and avoid claiming drop probabilities.
- [x] Include confirmed Carnival slot rules; unknown ranges remain unknown. Replace probability-led certificate UI with cautious opportunity/backup explanations; remove paid reroll prompts.
- [x] Validate migration, exact target persistence, ranking, dynamic effects, charm totals, discard proofs, mobile UI and production build. Publish through GitHub Pages and verify deployment.

Constraints: No fishing or Walkspeed utility; no paid refill/reroll advice; safest discard proof across future certificate changes; no invented game probabilities.
Review focus: restored backups, future certificate value, maximum Golden Hour vs zero Droughtbreaker, charm diversity and no invented certainty.
