# Optimiser logic repairs implementation plan

> **For agentic workers:** Use test-driven development and independent final review.

**Goal:** Repair all calculation and robustness findings in the v3.0.4 logic audit.
**Spec:** /workspace/logic-audit/REVIEW.md and the owner's instruction to repair all findings.
**Architecture:** Conservative same-slot proofs gate discard. Certificate integration bounds certify each numerical cell or allocate its full mass as uncertain. UI explains model assumptions and fixed policy is enforced on import.
**Tech stack:** Existing React/TypeScript/Vitest/Vite; no new dependencies.

## Constraints
- Preserve the confirmed28 inventory, unrelated user data and history.
- Preserve fixed70–90 Arrow and current scoring preferences.
- No invented verification of game probabilities or mutation formulas.
- No loss on any auction context can be hidden by a gain in another.

## Review focus
- Short future Arrow windows and Energy/Zone saturation cannot justify disposal.
- Unknown replacement effects must count as possible downside unless an unaffected set proves otherwise.
- Continuous-prior intervals with unobserved interior gains/losses need valid bounds.
- Paid number rerolls use conservative probability thresholds.
- Imports cannot silently override fixed scoring, and displayed model values disclose assumptions.

## Task1: Discard proofs
- [ ] Turn audited short-window and future Energy counterexamples into retention regression tests; observe failure.
- [ ] Require an explicit same-slot, componentwise replacement proof with equal Arrow, no worse relevant stats/mutation and compatible known authentication; keep unknown/unproven alternatives. A sample sweep can supply reasons but never prove disposal.
- [ ] Verify current optimal sets, tied sets, favourites and certificate-target guards; test removals together.

## Task2: Certificate probability and risk bounds
- [ ] Add failing default paid-reroll threshold, unknown Focused overshoot, missed narrow interval and contextual-loss cases.
- [ ] Bound numeric roll probability per cell; nonmonotone Arrow cells are uncertain unless certified. Return improvement lower/upper and downside upper for both new certificates and number rerolls.
- [ ] Use lower improvement probability for paid recommendations. Count any context's material/Arrow loss as downside; do not let another context's gain hide it.
- [ ] Include unknown replacement risk unless the best unaffected inventory is no worse than baseline. Keep equal effect/strength distribution assumptions explicit.

## Task3: Policy and model presentation
- [ ] Add failing same-version custom import policy test and model-value presentation checks.
- [ ] Enforce fixed algorithm settings on load/import without modifying inventory/history. Label modelled Luck contributions and estimated certificate odds/scenario ranges, distinguishing unknown evidence.

## Task4: Verify and release
- [ ] Run full regression suite and production build, independently review and resolve findings.
- [ ] Publish release via reviewed GitHub PR; verify merged-main tests and Pages deployment.
