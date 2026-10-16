// Names a kind of approval without an approval, for removeApproval() (domain model
// section 2, and 3.7).
export const APPROVAL_KINDS = [
  "driveHours",
  "routeType",
  "openingHours",
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
