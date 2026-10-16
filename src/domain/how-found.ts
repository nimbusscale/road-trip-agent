// How a candidate was found (domain model section 2, and 3.9). A worker finds it with
// Google or web search. The user names it with specifiedByUser.
export const HOW_FOUND_VALUES = [
  "google",
  "webSearch",
  "specifiedByUser",
] as const;

export type HowFound = (typeof HOW_FOUND_VALUES)[number];
