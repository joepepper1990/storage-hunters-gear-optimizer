export const MODEL_ASSUMPTIONS = {
  dynamic: {
    central: {
      droughtbreakerStacks: 3,
      goldenHourLuck: 50,
      luckFrenzyUptime: 0.15,
      drinkLuckBoost: 150,
      provenance: 'Sensitivity-only central scenario; not a claimed average game state.'
    },
    high: {
      droughtbreakerStacks: 5,
      goldenHourLuck: 100,
      luckFrenzyUptime: 0.30,
      drinkLuckBoost: 300,
      provenance: 'Upper sensitivity scenario; not a hidden probability estimate.'
    }
  },
  certificate: {
    // Roll-strength prior only (virtual samples inside one effect's range). Effect selection is always equal.
    priorStrength: 8,
    use: {
      maxCautiousWorsePct: 25,
      minCautiousImprovePct: 30,
      minFavourableImprovePct: 50,
      minConfidencePct: 35
    },
    consider: {
      minImprovePct: 20,
      maxCautiousWorsePct: 45
    },
    doNotUse: {
      minCautiousWorsePct: 55
    },
    provenance: 'Decision-policy thresholds, not Roblox odds. Named here so audits and future tuning have one source of truth.'
  },
  authenticator: {
    paidRerollRobux: 199,
    provenance: 'Current in-game immediate post-authentication price; both Reroll and Reroll Number use the same price.'
  }
} as const;

