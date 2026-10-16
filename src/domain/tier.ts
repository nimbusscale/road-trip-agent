// Budget tiers (domain model section 2, and technical spec section 9).
export const TIERS = ["value", "midRange", "posh"] as const;

export type Tier = (typeof TIERS)[number];

// How people say each tier, such as in the rule "the user picked a mid-range option".
export const TIER_WORDS: Readonly<Record<Tier, string>> = {
  value: "value",
  midRange: "mid-range",
  posh: "posh",
};

// The rule a tier gets when the user selects a candidate offered at another tier
// (technical spec section 9).
export function pickedTierRule(tier: Tier): string {
  return `the user picked a ${TIER_WORDS[tier]} option`;
}
