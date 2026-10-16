// Where a stop's candidates are searched (domain model section 2, and 3.7).
export const SEARCH_AREAS = [
  "nearStay",
  "alongLeg",
  "nearStartPlace",
  "nearEndPlace",
] as const;

export type SearchArea = (typeof SEARCH_AREAS)[number];
