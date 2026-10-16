import { Calendar } from "./calendar.js";
import type { Day } from "./day.js";
import type { Itinerary } from "./itinerary.js";
import { userOffer } from "./itinerary.fake.js";
import { Leg } from "./leg.js";
import { OpeningPeriod } from "./opening-period.js";
import type { Place } from "./place.js";
import { examplePlace } from "./place.fake.js";
import { ScheduleTime } from "./schedule-time.js";
import type { SearchArea } from "./search-area.js";
import type { Stay } from "./stay.js";
import { newStop, type Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import type { Trip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";
import type { Weekday } from "./weekday.js";

// The parts the example trips (domain model section 5) are built from, for tests. The
// trips are built with the objects' change methods, the way the services will build
// them.

export const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// The drive buffer setting's starting value (technical spec section 10).
export const DRIVE_BUFFER_PERCENT = 10;

// The calendar for a trip, with the clock stopped at `now`.
export function calendarFor(trip: Trip, now = new Date()): Calendar {
  return new Calendar({
    tripBrief: trip.tripBrief,
    settings: { driveBufferPercent: DRIVE_BUFFER_PERCENT },
    now: () => now,
  });
}

// A place with its own name and Google place ID, and the hours given. A place with no
// hours given has none, so its hours aren't known.
export function placeNamed(
  name: string,
  openingPeriods: readonly OpeningPeriod[] = [],
): Place {
  return examplePlace({
    name,
    googlePlaceId: `google-${name}`,
    openingPeriods,
    weekdayHoursLines: [],
  });
}

// Open on the day given, from one time to another the same day, such as "11:00" to
// "12:30".
export function openOn(day: Weekday, from: string, to: string): OpeningPeriod {
  return new OpeningPeriod({
    openDay: day,
    openTime: TimeOfDay.fromText(from),
    closeDay: day,
    closeTime: TimeOfDay.fromText(to),
  });
}

// How Google gives a place that's always open.
export const ALWAYS_OPEN = new OpeningPeriod({
  openDay: "sunday",
  openTime: new TimeOfDay(0, 0),
  closeDay: null,
  closeTime: null,
});

export function at(text: string, isNextDay = false): ScheduleTime {
  return new ScheduleTime(TimeOfDay.fromText(text), isNextDay);
}

export interface StopPlan {
  purpose: string;
  searchArea: SearchArea;
  stay?: Stay;
  setTime?: ScheduleTime;
}

export function meal(plan: StopPlan): Stop {
  return newStop({
    kind: "meal",
    purpose: plan.purpose,
    searchArea: plan.searchArea,
    searchAreaStay: plan.stay ?? null,
    setTime: plan.setTime ?? null,
    tier: "value",
    tierRule: "the trip default",
  });
}

export function attraction(plan: StopPlan): Stop {
  return newStop({
    kind: "attraction",
    purpose: plan.purpose,
    searchArea: plan.searchArea,
    searchAreaStay: plan.stay ?? null,
    setTime: plan.setTime ?? null,
    tier: null,
    tierRule: null,
  });
}

// Puts the stops on the day, in order.
export function layOut(day: Day | undefined, stops: readonly Stop[]): void {
  day?.[VIA_SERVICE].placeStops(stops, null);
}

// A stop, the place to select for it, and its visit time.
export type PickedStop = [Stop, Place, number];

// Puts the stops on the day in order, and selects each one's place.
export function fillDay(
  day: Day | undefined,
  stops: readonly PickedStop[],
): void {
  layOut(
    day,
    stops.map(([stop]) => stop),
  );
  stops.forEach(([stop, place, visit]) => {
    pick(stop, place, visit);
  });
}

// Selects a place the user named for the stop, with the visit time given.
export function pick(stop: Stop, place: Place, visitTimeInMinutes = 60): void {
  stop[VIA_SERVICE].addCandidates([
    {
      ...userOffer(place),
      visitTimeInMinutes:
        stop.kind === "attraction" ? visitTimeInMinutes : null,
    },
  ]);
  stop[VIA_SERVICE].selectCandidate(place, visitTimeInMinutes);
}

// Selects the stay's lodging, from a place the user named.
export function lodgeAt(stay: Stay, place: Place): void {
  stay[VIA_SERVICE].addLodgingCandidates([userOffer(place)]);
  stay.selectCandidate(place);
}

// Gives the day a leg through its selected stops, with made-up segment drive times
// (without the buffer), the way LegsService will (domain model 4.7).
export function routeDay(
  calendar: Calendar,
  itinerary: Itinerary,
  day: Day | undefined,
  segmentDriveTimesInMinutes: readonly number[],
): void {
  if (day === undefined) {
    return;
  }
  const from = calendar.fromPlaceOf(itinerary, day);
  const to = calendar.toPlaceOf(itinerary, day);
  if (from === null || to === null) {
    throw new Error("A day is routed only once both its ends are known.");
  }
  day[VIA_SERVICE].setLeg(
    new Leg({
      segmentDriveTimesInMinutes,
      distanceInMiles: 100,
      routeLine: "_p~iF~ps|U_ulLnnqC",
      stopsInBestOrder: [],
      timeSavedInMinutes: 0,
      routedFromPlace: from,
      routedToPlace: to,
      routedStopPlaces: day.stops.flatMap((stop) => stop.selectedPlace ?? []),
      routedWaypoints: day.waypoints,
    }),
  );
}
