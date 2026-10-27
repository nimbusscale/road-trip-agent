import { Day, type DayChanges, type DayFields } from "./day.js";
import { RuleError } from "./rule-error.js";
import { VIA_SERVICE } from "./via-service.js";
import type { Waypoint } from "./waypoint.js";

export interface StayDayFields extends DayFields {
  isRestDay: boolean;
}

export interface StayDayChanges extends DayChanges {
  // A rest day has no leg. LegsService removes it, with its waypoints, at the end of the
  // write, so the write hands the removed leg back (domain model 4.7). Its approvals
  // stay.
  setRestDay(isRestDay: boolean): void;
}

// A day that ends with a night at a stay. The stay holds it (domain model 3.6).
export class StayDay extends Day {
  readonly kind = "stayDay" as const;
  #isRestDay: boolean;

  override readonly [VIA_SERVICE]: StayDayChanges = {
    ...this.dayChanges(),
    setRestDay: (isRestDay) => {
      this.#isRestDay = isRestDay;
    },
  };

  constructor(fields: StayDayFields) {
    super(fields);
    this.#isRestDay = fields.isRestDay;
  }

  // A day with no driving. DaysService.setRestDay() changes it.
  get isRestDay(): boolean {
    return this.#isRestDay;
  }

  // A rest day keeps its leg until the end of the write that marks it, when
  // LegsService removes the leg and its waypoints. So it refuses waypoints itself,
  // rather than take them and drop them. Clearing them is fine, such as when fastest is
  // approved in the same write (domain model 4.5).
  override setWaypoints(waypoints: readonly Waypoint[]): void {
    if (this.#isRestDay && waypoints.length > 0) {
      throw new RuleError(
        "A rest day can't have waypoints, since it has no drive.",
      );
    }
    super.setWaypoints(waypoints);
  }
}
