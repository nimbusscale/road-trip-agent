import type { ApprovalKind } from "./approval-kind.js";
import type { Calendar } from "./calendar.js";
import type { CheckContext, FeasibilitySettings } from "./check-context.js";
import type { CheckResult } from "./check-result.js";
import { Day } from "./day.js";
import { dayCheckResults, isDriveHoursApprovalApplying } from "./day-checks.js";
import type { Itinerary } from "./itinerary.js";
import { tripAndStayCheckResults } from "./stay-checks.js";
import {
  isOpeningHoursApprovalApplying,
  stopCheckResults,
} from "./stop-checks.js";
import type { Stop } from "./stop.js";
import type { TripBrief } from "./trip-brief.js";

// What the FeasibilityChecker is given (domain model 4.8).
export interface FeasibilityCheckerGiven {
  // For the items the checks compare against. Read on each call.
  tripBrief: TripBrief;
  settings: FeasibilitySettings;
  calendar: Calendar;
}

// The current check results matched with the saved ones (domain model 4.8). It isn't
// stored.
export interface CheckComparison {
  // No saved match, or the saved match was approved and this isn't, or the saved match
  // was marked "may be too early" and this isn't.
  readonly newResults: readonly CheckResult[];
  // Every other current check result.
  readonly knownResults: readonly CheckResult[];
  // Saved check results with no current match. Their saved text describes them, since
  // their subject may be gone.
  readonly goneResults: readonly CheckResult[];
}

// Runs the feasibility checks in technical spec section 8, and tells which results are
// new (domain model 4.8). Created for one trip. It saves nothing: the finish of a
// coordinator write saves the list with Itinerary.replaceCheckResults().
export class FeasibilityChecker {
  readonly #given: FeasibilityCheckerGiven;

  constructor(given: FeasibilityCheckerGiven) {
    this.#given = given;
  }

  // The check results that apply now, over the whole itinerary.
  workOut(itinerary: Itinerary): CheckResult[] {
    const context = this.#contextFor(itinerary);
    return [
      ...tripAndStayCheckResults(context),
      ...dayCheckResults(context),
      ...stopCheckResults(context),
    ];
  }

  // Two check results match when they have the same check and subject, whatever their
  // text says.
  compare(
    current: readonly CheckResult[],
    saved: readonly CheckResult[],
  ): CheckComparison {
    const newResults: CheckResult[] = [];
    const knownResults: CheckResult[] = [];
    current.forEach((result) => {
      const match = saved.find((each) => each.isSameAs(result));
      const isNew =
        match === undefined ||
        (match.isApproved && !result.isApproved) ||
        (match.hasUnselectedStopBefore && !result.hasUnselectedStopBefore);
      (isNew ? newResults : knownResults).push(result);
    });
    const goneResults = saved.filter(
      (result) => !current.some((each) => each.isSameAs(result)),
    );
    return { newResults, knownResults, goneResults };
  }

  // Whether the holder's approval of that kind still covers the plan as it is now.
  // False when it has none. A route type approval always applies.
  isApplying(
    itinerary: Itinerary,
    holder: Day | Stop,
    kind: ApprovalKind,
  ): boolean {
    const context = this.#contextFor(itinerary);
    if (holder instanceof Day) {
      if (kind === "driveHours") {
        return isDriveHoursApprovalApplying(context, holder);
      }
      return (
        kind === "routeType" &&
        holder.approvals.some((approval) => approval.kind === "routeType")
      );
    }
    return (
      kind === "openingHours" && isOpeningHoursApprovalApplying(context, holder)
    );
  }

  #contextFor(itinerary: Itinerary): CheckContext {
    return { itinerary, ...this.#given };
  }
}
