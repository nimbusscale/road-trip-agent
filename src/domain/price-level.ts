// Google's price levels (domain model section 2). Workers judge a tier from them.
export const PRICE_LEVELS = [
  "free",
  "inexpensive",
  "moderate",
  "expensive",
  "veryExpensive",
] as const;

export type PriceLevel = (typeof PRICE_LEVELS)[number];
