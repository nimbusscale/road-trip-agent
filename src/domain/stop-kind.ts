// Domain model section 2.
export const STOP_KINDS = ["meal", "attraction", "checkIn"] as const;

export type StopKind = (typeof STOP_KINDS)[number];
