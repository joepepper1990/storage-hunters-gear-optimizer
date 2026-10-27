# Open-finding correction, v2.4.0

Base main: 43f56fa6b1c61a0f09e8cc429d2748e3fbd730f9 (v2.3.2).

This release addresses every outstanding finding from the two latest reviews:

| Finding | Correction |
| --- | --- |
| Stale-tab autosave/pagehide can overwrite newer data | Capture-time provenance, atomic IndexedDB compare-and-write, conflict handling and recovery ancestry checks. Conflicts retain local edits for explicit backup/reload. |
| Invalid settings permit discard proofs | One validator gates engine proofs, certificate advice and destructive UI actions. |
| Focused scan stores boosted readings as base | Explicit original-base confirmation before conversion, preserving displayed deltas on authentication. |
| JSON restore accepts malformed observed deltas | Shared finite numeric known-key validation for JSON and CSV. |
| Midpoint estimates can cross policy limits | Conservative probability and utility bounds govern decisions, including personal-tier and specialist thresholds. |
| Zero-baseline specialist percentage discontinuity | All specialist gains use stable native utility-point differences. Named per-dimension policy thresholds avoid mixing units. |
| Other-slot/history samples masquerade as model-only evidence | Provenance-backed observations removed before legacy fallback; partial histories are not duplicated. |
| Drink-active totals omit the base drink | Include base drink Luck once, then add Overcharged amplification. |
| SAFE proof covers Main but not future specialists | Additional componentwise specialist and mutation-value requirements retain pieces without a full safe proof. |
| Paid advice waits behind every certificate/target | Independent worker request, target-limited effect analysis, separate freshness keys. |

Existing schema-13 inventory, certificates, settings and roll history are retained. No reset or reseeding is introduced. The intentional startup migration remains distinct from explicit legacy-backup restore.

The optimiser reports utility under its stated model. Unpublished game probabilities, grade/mutation transforms and proc behaviour remain explicit assumptions or unresolved values. Numerical error guards do not make assumed game distributions measured facts.

Validation uses regression counterexamples, differential comparison with full enumeration, component safety tests, locked dependency installation, TypeScript, production PWA build and a separate merged-main deployment run. Exact results are recorded in PR #17 and GitHub Actions.
