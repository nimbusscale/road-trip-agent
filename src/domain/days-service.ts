import type { Settings } from "../config/settings.schema.js";
import { DriveHoursApproval, RouteTypeApproval } from "./approval.js";
import type { ApprovalKind } from "./approval-kind.js";
import type { Calendar } from "./calendar.js";
import { type Day, describeStop } from "./day.js";
import type { Itinerary } from "./itinerary.js";
import type { RouteType } from "./route-type.js";
import { RuleError } from "./rule-error.js";
import type { StayDay } from "./stay-day.js";
import { VIA_SERVICE } from "./via-service.js";
import type { Waypoint } from "./waypoint.js";

export type DaysSettings = Pick<Settings, "maximumDailyDrivingHours">;

// The business rules about days: which days can be rest days, the most driving an
// approval can cover, and the waypoints approving fastest clears (domain model 4.5).
export class DaysService {
  readonly #settings: DaysSettings;
  readonly #calendar: Calendar;

  constructor(given: { settings: DaysSettings; calendar: Calendar }) {
    this.#settings = given.settings;
    this.#calendar = given.calendar;
  }

  // Marking it removes the day's leg, by the day's own rule. Its approvals stay.
  setRestDay(itinerary: Itinerary, day: StayDay, isRestDay: boolean): void {
    if (isRestDay) {
      this.#refuseUnrestfulDay(itinerary, day);
    }
    day[VIA_SERVICE].setRestDay(isRestDay);
  }

  approveDriveHours(day: Day, drivingInHours: number, reason: string): void {
    const maximum = this.#settings.maximumDailyDrivingHours;
    if (drivingInHours > maximum) {
      throw new RuleError(
        `A day's driving is at most ${String(maximum)} hours, so an approval can't go over it. It was given ${String(drivingInHours)}.`,
      );
    }
    day[VIA_SERVICE].setApproval(
      new DriveHoursApproval({
        reason,
        approvedDrivingInHours: drivingInHours,
      }),
    );
  }

  // Approving fastest clears the day's waypoints, so none can keep the day on a scenic
  // road under a fastest label. Returns the ones it cleared, so the coordinator can put
  // back those set for a must-see or the user's request (technical spec 5.2). Scenic
  // leaves them alone. A day with no leg has none, so it never clears one there.
  approveRouteType(
    day: Day,
    routeType: RouteType,
    reason: string,
  ): readonly Waypoint[] {
    day[VIA_SERVICE].setApproval(
      new RouteTypeApproval({ reason, approvedRouteType: routeType }),
    );
    const cleared = routeType === "fastest" ? day.waypoints : [];
    if (cleared.length > 0) {
      day.setWaypoints([]);
    }
    return cleared;
  }

  // Does nothing when the day has none of that kind.
  removeApproval(day: Day, kind: ApprovalKind): void {
    day[VIA_SERVICE].removeApproval(kind);
  }

  // A day that moves has to drive. And nothing would place a stop with no set time in
  // a day with no drives.
  #refuseUnrestfulDay(itinerary: Itinerary, day: StayDay): void {
    if (!this.#calendar.isStayingPut(itinerary, day)) {
      throw new RuleError(
        "Only a day that starts and ends at the same stay can be a rest day. This day moves to a new stay, so it has to drive.",
      );
    }
    const untimed = day.stops.filter((stop) => stop.setTime === null);
    if (untimed.length > 0) {
      throw new RuleError(
        `Each stop on a rest day needs a set time. Give these one first: ${untimed.map(describeStop).join("; ")}.`,
      );
    }
  }
}
