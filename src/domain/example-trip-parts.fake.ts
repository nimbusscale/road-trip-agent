import type { Settings } from "../config/settings.schema.js";
import { Calendar } from "./calendar.js";
import type { Day } from "./day.js";
import type { Itinerary } from "./itinerary.js";
import { userOffer } from "./itinerary.fake.js";
import { Leg, type LegFields } from "./leg.js";
import { OpeningPeriod } from "./opening-period.js";
import type { Place } from "./place.js";
import { examplePlace } from "./place.fake.js";
import { ScheduleTime } from "./schedule-time.js";
import type { SearchArea } from "./search-area.js";
import type { Stay } from "./stay.js";
import { newStop, type Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import type { Trip } from "./trip.js";
import { calendarAndServicesFor, type TripServices } from "./trip-services.js";
import { VIA_SERVICE } from "./via-service.js";
import type { Weekday } from "./weekday.js";

// The parts the example trips (domain model section 5) are built from, for tests. The
// trips are built through the services, the way the tools will build them. Only the
// legs are set directly, with made-up drive times, so the schedules come out as the
// examples show them. LegsService routes legs with Google (domain model 4.7).

export const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// The settings' starting values (technical spec section 10).
export const EXAMPLE_SETTINGS: Settings = {
  lateAllowanceMinutes: 15,
  stopOrderMinimumSavingMinutes: 15,
  driveBufferPercent: 10,
  alongLegEndDistanceMiles: 2,
  nearDistanceMiles: 15,
  maximumTripLengthDays: 14,
  maximumDailyDrivingHours: 12,
  recommendedDailyDrivingHours: 6,
  mealVisitMinutes: 60,
  checkInVisitMinutes: 30,
  maximumMemoryItems: 50,
  maximumMemoryItemCharacters: 300,
  coordinatorModel: "claude-opus-5-5",
};

// The drive buffer setting's starting value.
export const DRIVE_BUFFER_PERCENT = EXAMPLE_SETTINGS.driveBufferPercent;

// When the example trips are planned: the morning of 2026-10-15 in the US, well before
// either trip starts.
export const PLANNED_AT = new Date("2026-10-15T16:00:00Z");

// A trip being planned through its services, with the clock stopped at `now`.
export interface Planning {
  trip: Trip;
  itinerary: Itinerary;
  calendar: Calendar;
  services: TripServices;
}

export function planningFor(trip: Trip, now = PLANNED_AT): Planning {
  return {
    trip,
    itinerary: trip.itinerary,
    ...calendarAndServicesFor(trip, EXAMPLE_SETTINGS, () => now),
  };
}

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
  });
}

export function attraction(plan: StopPlan): Stop {
  return newStop({
    kind: "attraction",
    purpose: plan.purpose,
    searchArea: plan.searchArea,
    searchAreaStay: plan.stay ?? null,
    setTime: plan.setTime ?? null,
  });
}

// Puts the stops on the day, in order, after any it has.
export function layOut(
  planning: Planning,
  day: Day | undefined,
  stops: readonly Stop[],
): void {
  if (day !== undefined) {
    planning.services.stops.addStops(
      planning.itinerary,
      day,
      stops,
      day.stops.at(-1) ?? null,
    );
  }
}

// A stop, the place to select for it, and its visit time.
export type PickedStop = [Stop, Place, number];

// Puts the stops on the day in order, and selects each one's place.
export function fillDay(
  planning: Planning,
  day: Day | undefined,
  stops: readonly PickedStop[],
): void {
  layOut(
    planning,
    day,
    stops.map(([stop]) => stop),
  );
  stops.forEach(([stop, place, visit]) => {
    pick(planning, stop, place, visit);
  });
}

// Selects a place the user named for the stop, as the tool select_user_place does. An
// attraction gets the visit time given, and a meal the meal visit time setting.
export function pick(
  planning: Planning,
  stop: Stop,
  place: Place,
  visitTimeInMinutes = 60,
): void {
  const { itinerary, services } = planning;
  services.stops.addCandidates(itinerary, stop, [
    {
      ...userOffer(place),
      visitTimeInMinutes:
        stop.kind === "attraction" ? visitTimeInMinutes : null,
    },
  ]);
  services.stops.selectCandidate(stop, place);
}

// Selects the stay's lodging, from a place the user named.
export function lodgeAt(planning: Planning, stay: Stay, place: Place): void {
  planning.services.stays.addLodgingCandidates(planning.itinerary, stay, [
    userOffer(place),
  ]);
  stay.selectCandidate(place);
}

// Gives the day a leg through its selected stops, with made-up segment drive times
// (without the buffer), the way LegsService does (domain model 4.7).
export function routeDay(
  calendar: Calendar,
  itinerary: Itinerary,
  day: Day | undefined,
  segmentDriveTimesInMinutes: readonly number[],
): void {
  routeDayAlong(calendar, itinerary, day, {
    segmentDriveTimesInMinutes,
    distanceInMiles: 100,
    routeLine: "_p~iF~ps|U_ulLnnqC",
  });
}

// The same, along a route Google gave, such as a saved response's.
export function routeDayAlong(
  calendar: Calendar,
  itinerary: Itinerary,
  day: Day | undefined,
  route: Pick<
    LegFields,
    "segmentDriveTimesInMinutes" | "distanceInMiles" | "routeLine"
  >,
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
      ...route,
      stopsInBestOrder: [],
      timeSavedInMinutes: 0,
      routedFromPlace: from,
      routedToPlace: to,
      routedStopPlaces: calendar.stopPlacesOf(itinerary, day),
      routedWaypoints: day.waypoints.map((waypoint) => waypoint.place),
    }),
  );
}
