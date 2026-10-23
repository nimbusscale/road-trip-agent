import type { Calendar } from "../domain/calendar.js";
import type { CheckResult } from "../domain/check-result.js";
import type { FeasibilityChecker } from "../domain/feasibility-checker.js";
import type { Itinerary } from "../domain/itinerary.js";

// What read_itinerary builds its lines from. A read runs the checks and compares them
// with the saved ones, and saves nothing (domain model 4.8).
export interface ReadContext {
  readonly itinerary: Itinerary;
  readonly calendar: Calendar;
  readonly checker: FeasibilityChecker;
  // Every check result that applies now, in the checker's order.
  readonly currentResults: readonly CheckResult[];
  // Those the comparison found new. The rest are already known.
  readonly newResults: ReadonlySet<CheckResult>;
}
