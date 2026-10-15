// Domain model section 2.
export const ROUTE_TYPES = ["scenic", "fastest"] as const;

export type RouteType = (typeof ROUTE_TYPES)[number];
