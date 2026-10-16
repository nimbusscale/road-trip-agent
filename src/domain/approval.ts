import type { ApprovalKind } from "./approval-kind.js";
import type { RouteType } from "./route-type.js";
import { RuleError } from "./rule-error.js";

// An exception the user agreed to, with their reason (domain model 3.7, and technical
// spec section 8). It's a tagged union: `kind` says which value it holds. Its properties
// never change. Setting a new one of the same kind replaces it.

export class DriveHoursApproval {
  readonly kind = "driveHours" as const;
  readonly reason: string;
  // The hours the user agreed to. More than 0.
  readonly approvedDrivingInHours: number;

  constructor(fields: { reason: string; approvedDrivingInHours: number }) {
    this.reason = checkedReason(fields.reason);
    if (
      !Number.isFinite(fields.approvedDrivingInHours) ||
      fields.approvedDrivingInHours <= 0
    ) {
      throw new RuleError(
        `A drive hours approval's hours have to be more than 0. It was given ${String(fields.approvedDrivingInHours)}.`,
      );
    }
    this.approvedDrivingInHours = fields.approvedDrivingInHours;
  }
}

export class RouteTypeApproval {
  readonly kind = "routeType" as const;
  readonly reason: string;
  // The route type the user agreed to, such as fastest. No check reads it.
  readonly approvedRouteType: RouteType;

  constructor(fields: { reason: string; approvedRouteType: RouteType }) {
    this.reason = checkedReason(fields.reason);
    this.approvedRouteType = fields.approvedRouteType;
  }
}

export class OpeningHoursApproval {
  readonly kind = "openingHours" as const;
  readonly reason: string;
  // How many minutes of the visit fell within opening hours. 0 or more. 0 approves a
  // place that's closed for the whole visit.
  readonly approvedOpenTimeInMinutes: number;

  constructor(fields: { reason: string; approvedOpenTimeInMinutes: number }) {
    this.reason = checkedReason(fields.reason);
    if (
      !Number.isInteger(fields.approvedOpenTimeInMinutes) ||
      fields.approvedOpenTimeInMinutes < 0
    ) {
      throw new RuleError(
        `An opening hours approval's minutes have to be a whole number, 0 or more. It was given ${String(fields.approvedOpenTimeInMinutes)}.`,
      );
    }
    this.approvedOpenTimeInMinutes = fields.approvedOpenTimeInMinutes;
  }
}

// A day holds drive hours and route type approvals. A stop holds opening hours ones.
export type DayApproval = DriveHoursApproval | RouteTypeApproval;
export type Approval = DayApproval | OpeningHoursApproval;

// The holder's approvals with this one in, replacing any of the same kind, so a holder
// has at most one of each kind.
export function withApproval<T extends Approval>(
  approvals: readonly T[],
  approval: T,
): T[] {
  return [...withoutApproval(approvals, approval.kind), approval];
}

export function withoutApproval<T extends Approval>(
  approvals: readonly T[],
  kind: ApprovalKind,
): T[] {
  return approvals.filter((each) => each.kind !== kind);
}

// For a holder's constructor: a stored list with two of one kind is refused.
export function checkedApprovals<T extends Approval>(
  approvals: readonly T[],
): T[] {
  const kinds = new Set(approvals.map((approval) => approval.kind));
  if (kinds.size !== approvals.length) {
    throw new RuleError(
      "A day or stop holds at most one approval of each kind.",
    );
  }
  return [...approvals];
}

function checkedReason(reason: string): string {
  if (reason.trim() === "") {
    throw new RuleError("An approval needs the user's reason.");
  }
  return reason;
}
