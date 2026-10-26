import type { CheckKind, CheckLevel } from "./check-kind.js";
import { RuleError } from "./rule-error.js";

export interface CheckResultFields {
  check: CheckKind;
  subjectId: string;
  text: string;
  isApproved: boolean;
  hasUnselectedStopBefore: boolean;
}

// Each check's level (domain model 3.3).
const LEVELS: Readonly<Record<CheckKind, CheckLevel>> = {
  tripLengthVsBrief: "warning",
  dailyDriving: "warning",
  openingHoursNotLongEnough: "warning",
  openingHoursClosed: "warning",
  openingHoursNotKnown: "note",
  lateForSetTime: "warning",
  stopOrder: "note",
  searchAreaDoesNotFitDay: "warning",
  weatherOutOfDate: "note",
  forecastNowAvailable: "note",
};

// Only these can depend on a stop before them with no place yet: a stop with no place
// takes no time, so a place that looks closed may be open once it does. A late or
// driving warning would only get worse, so it's real (domain model 3.3).
const CHECKS_WITH_UNSELECTED_STOP_BEFORE: readonly CheckKind[] = [
  "openingHoursNotLongEnough",
  "openingHoursClosed",
];

// One finding from the feasibility checks (domain model 3.3). The FeasibilityChecker
// creates it, and it never changes. The itinerary's list is replaced whole instead.
export class CheckResult {
  readonly check: CheckKind;
  // An ID, not a link, since a write can remove the stop or stay before the compare.
  readonly subjectId: string;
  readonly text: string;
  readonly isApproved: boolean;
  readonly hasUnselectedStopBefore: boolean;

  constructor(fields: CheckResultFields) {
    if (
      fields.hasUnselectedStopBefore &&
      !CHECKS_WITH_UNSELECTED_STOP_BEFORE.includes(fields.check)
    ) {
      throw new RuleError(
        `Only the two opening-hours warnings can have an unselected stop before them, not ${fields.check}.`,
      );
    }
    this.check = fields.check;
    this.subjectId = fields.subjectId;
    this.text = fields.text;
    this.isApproved = fields.isApproved;
    this.hasUnselectedStopBefore = fields.hasUnselectedStopBefore;
  }

  get level(): CheckLevel {
    return LEVELS[this.check];
  }

  // Two check results are the same when they come from the same check about the same
  // thing, whatever their text says (technical spec section 8).
  isSameAs(other: CheckResult): boolean {
    return this.check === other.check && this.subjectId === other.subjectId;
  }
}
