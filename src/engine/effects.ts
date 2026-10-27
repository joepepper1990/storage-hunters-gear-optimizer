/**
 * One classification of authentication effects shared by scoring, dominance,
 * retention and discard. It never depends on the authentication kind: a Limited,
 * Premium, Normal or legacy Alien row with an unmodelled effect is equally unknown.
 */
export type EffectKnowledge = 'modelled' | 'zero' | 'unknown';

const MODELLED_EFFECTS = new Set([
  'Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance',
  'NPC Offers Bonus','Sunny','Nocturnal','Overcharged','Raindrop','Mutated Luck',
  'Droughtbreaker','Drought Breaker','Golden Hour','Luck Frenzy','Grade Re-Roll'
]);

/** Effects this profile deliberately values at zero (F tier, or no Heavy Hauling / Time Capsule loadout). */
const ZERO_VALUE_EFFECTS = new Set([
  'Walkspeed','Time Keeper','Timekeeper','Connected','Club Pact','Club Packed','Auto X-Ray',
  'Second Chance','Steady Hand','Haggler','Featherweight','Temporal Split'
]);

export function effectKnowledge(effect: string): EffectKnowledge {
  const name = effect.trim();
  if (MODELLED_EFFECTS.has(name)) return 'modelled';
  if (ZERO_VALUE_EFFECTS.has(name)) return 'zero';
  // Focused, Fossil Finder, Safecracker, Exhibitor, Anti-Gravity Field, Rush, Sonic and
  // every imported/custom effect: a non-zero value could change a discard decision.
  return 'unknown';
}

export interface AuthenticatedLike {
  authenticated: boolean;
  authentication: { kind: string; effect: string };
}

/** True when an item's live authentication has an effect whose value is not resolved. */
export function hasUnknownEffect(item: AuthenticatedLike): boolean {
  if (!item.authenticated || item.authentication.kind === 'None') return false;
  const effect = item.authentication.effect.trim();
  return Boolean(effect) && effectKnowledge(effect) === 'unknown';
}
