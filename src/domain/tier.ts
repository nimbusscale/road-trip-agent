// Budget tiers: what a lodging or meal candidate is like, judged by the worker that
// found it (domain model section 2, and technical spec section 9).
export const TIERS = ["value", "midRange", "upscale"] as const;

export type Tier = (typeof TIERS)[number];
