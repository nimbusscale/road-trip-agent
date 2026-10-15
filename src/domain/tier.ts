// Budget tiers (domain model section 2, and technical spec section 9).
export const TIERS = ["value", "midRange", "posh"] as const;

export type Tier = (typeof TIERS)[number];
