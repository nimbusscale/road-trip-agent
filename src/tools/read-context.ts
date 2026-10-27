import type { Settings } from "../config/settings.schema.js";
import type { Calendar } from "../domain/calendar.js";
import type { CheckResult } from "../domain/check-result.js";
import { FeasibilityChecker } from "../domain/feasibility-checker.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Trip } from "../domain/trip.js";
import { calendarAndServicesFor } from "../domain/trip-services.js";

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

// read_itinerary and the plan's downloads both build their lines from this, so a
// download shows what a read would (functional spec 10.1).
export function readContextOf(
  trip: Trip,
  settings: Settings,
  now: () => Date,
): ReadContext {
  const { calendar } = calendarAndServicesFor(trip, settings, now);
  const checker = new FeasibilityChecker({
    tripBrief: trip.tripBrief,
    settings,
    calendar,
  });
  const itinerary = trip.itinerary;
  const currentResults = checker.workOut(itinerary);
  const comparison = checker.compare(currentResults, itinerary.checkResults);
  return {
    itinerary,
    calendar,
    checker,
    currentResults,
    newResults: new Set(comparison.newResults),
  };
}
