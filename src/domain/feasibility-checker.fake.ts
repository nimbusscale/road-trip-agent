import type { Calendar } from "./calendar.js";
import type { CheckKind } from "./check-kind.js";
import type { CheckResult } from "./check-result.js";
import type { Day } from "./day.js";
import { EXAMPLE_SETTINGS } from "./example-trip-parts.fake.js";
import { FeasibilityChecker } from "./feasibility-checker.js";
import { Leg } from "./leg.js";
import type { Stop } from "./stop.js";
import type { Trip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";

// What the FeasibilityChecker tests share.

export function checkerFor(trip: Trip, calendar: Calendar): FeasibilityChecker {
  return new FeasibilityChecker({
    tripBrief: trip.tripBrief,
    settings: EXAMPLE_SETTINGS,
    calendar,
  });
}

// The checks found about one subject, such as a stop's ID.
export function checksAbout(
  results: readonly CheckResult[],
  subjectId: string,
): CheckKind[] {
  return results
    .filter((result) => result.subjectId === subjectId)
    .map((result) => result.check);
}

export function resultOf(
  results: readonly CheckResult[],
  check: CheckKind,
  subjectId: string,
): CheckResult | undefined {
  return results.find(
    (result) => result.check === check && result.subjectId === subjectId,
  );
}

// Replaces the day's leg with the same route, and the best order and time saved given,
// for the stop-order check. LegsService works them out when it routes the leg.
export function withBestOrder(
  day: Day,
  bestOrder: { stops: readonly Stop[]; timeSavedInMinutes: number },
): void {
  const leg = day.leg;
  if (leg === null) {
    throw new Error("The day needs a leg first.");
  }
  day[VIA_SERVICE].setLeg(
    new Leg({
      segmentDriveTimesInMinutes: leg.segmentDriveTimesInMinutes,
      distanceInMiles: leg.distanceInMiles,
      routeLine: leg.routeLine,
      stopsInBestOrder: bestOrder.stops,
      timeSavedInMinutes: bestOrder.timeSavedInMinutes,
      routedFromPlace: leg.routedFromPlace,
      routedToPlace: leg.routedToPlace,
      routedStopPlaces: leg.routedStopPlaces,
      routedWaypoints: leg.routedWaypoints,
    }),
  );
}
