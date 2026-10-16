import { RuleError } from "./rule-error.js";
import type { TimeOfDay } from "./time-of-day.js";
import type { Weekday } from "./weekday.js";

export interface OpeningPeriodFields {
  openDay: Weekday;
  openTime: TimeOfDay;
  closeDay: Weekday | null;
  closeTime: TimeOfDay | null;
}

// One opening and the closing after it, from Google's weekly hours (domain model 3.10).
// A closing can fall on the next day, so a bar open Monday 5 p.m. to 2 a.m. closes on
// Tuesday. Only a place that's always open has a period with no closing.
export class OpeningPeriod {
  readonly openDay: Weekday;
  readonly openTime: TimeOfDay;
  readonly closeDay: Weekday | null;
  readonly closeTime: TimeOfDay | null;

  constructor(fields: OpeningPeriodFields) {
    if ((fields.closeDay === null) !== (fields.closeTime === null)) {
      throw new RuleError(
        "An opening period's closing day and time come together: both set, or both empty.",
      );
    }
    this.openDay = fields.openDay;
    this.openTime = fields.openTime;
    this.closeDay = fields.closeDay;
    this.closeTime = fields.closeTime;
  }

  get hasClosing(): boolean {
    return this.closeDay !== null;
  }
}
