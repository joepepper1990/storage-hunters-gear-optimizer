# Logic audit repairs — v3.0.5

Base main:126181c60acc46450aa9155c67e5899b85062d8c (v3.0.4).

## Changes

- Discard now requires a conservative same-slot replacement proof. Equal native/effective Arrow avoids both undershooting and overshooting; componentwise native/effective stat and mutation requirements survive saturation and authentication replacement. Compatible known effects and strict improvements prevent unsafe or cyclic batch proofs. Samples can protect items but cannot certify deletion.
- Certificate probability bounds use exact cell masses, boundary evaluations and conservative uncertainty for unproved Arrow intervals. An unsampled interior interval cannot silently contribute zero uncertainty.
- Paid number rerolls compare the improvement lower bound against the required threshold. The audited 30%-midpoint / under29.6%-model example no longer recommends paying.
- Unknown replacement outcomes count as possible harm unless unaffected sets prove no loss in all four contexts. Expected Main safety also uses a conservative lower bound, including unresolved harm.
- Main, Day, Night and Rain losses are counted as downside; one context's gain cannot hide another's loss.
- All loads/restores apply the fixed algorithm policy, including version2.3 imported overrides. Equipment, certificates, history and editable appearance are retained.
- Best Set distinguishes numeric Item Luck from modelled effects. Certificate estimates identify assumed odds, dynamic scenarios and unresolved strengths. No unpublished game mechanic is newly claimed as verified.

## Regression evidence

Audited failures were observed before repair: future Energy50 saturation; Race Valk/Luxury Fedora short future Arrow windows; paid reroll rounding threshold; unknown Focused Arrow overshoot; narrow unsampled improvement interval; contextual Sunny/Nocturnal loss; same-version hidden settings; model presentation. All now have permanent regression coverage.

Additional checks cover native Back stats after certificate replacement, strict replacement chains, mutation roles, unknown candidates, current contextual/dynamic optima, and independent dense Arrow probability comparisons on wide and narrow bands. The existing best-trio evaluator is unchanged.

## Data scope

No inventory migration or reseeding is added. The confirmed28 inventory stays intact. Fixed algorithm settings are reapplied by existing normalisation. Optional cloud sync's integration test now uses the editable theme as its test marker rather than a hidden algorithm override.

## Verification

Final full regression suite, TypeScript/PWA build and independent review are required before merging. GitHub PR and merged-main deployment checks provide release evidence.
