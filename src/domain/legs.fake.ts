import { CalendarDate } from "./calendar-date.js";
import type { Day } from "./day.js";
import {
  meal,
  OWNER,
  pick,
  PLANNED_AT,
  type Planning,
  planningFor,
  EXAMPLE_SETTINGS,
} from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { type LegChange, LegsService } from "./legs-service.js";
import { type MoabExample, moabExample } from "./moab-example.fake.js";
import type { Place } from "./place.js";
import { examplePlace } from "./place.fake.js";
import type { RoutePath } from "./route-finder.js";
import { FakeRouteFinder } from "./route-finder.fake.js";
import type { Stay } from "./stay.js";
import type { StayDay } from "./stay-day.js";
import { newTrip } from "./trip.js";

// What the LegsService tests share. Most example places are all at Smitty's Market, so
// the San Francisco places here are where they really are, and waypoints are placed as
// they would be.

export function placeAt(
  name: string,
  latitude: number,
  longitude: number,
): Place {
  return examplePlace({
    name,
    googlePlaceId: `google-${name}`,
    latitude,
    longitude,
  });
}

export const MONTEREY = placeAt("Monterey", 36.5973, -121.8978);
export const FIRST_AWAKENINGS = placeAt("First Awakenings", 36.6169, -121.905);
export const BIG_SUR = placeAt("Big Sur village", 36.2704, -121.808);
export const NEPENTHE = placeAt("Nepenthe", 36.2218, -121.7593);
export const SAN_LUIS_OBISPO = placeAt("San Luis Obispo", 35.2828, -120.6596);

export interface WithLegs {
  legs: LegsService;
  finder: FakeRouteFinder;
}

export function legsFor(planning: Planning): WithLegs {
  const finder = new FakeRouteFinder();
  return {
    legs: new LegsService({ calendar: planning.calendar, routeFinder: finder }),
    finder,
  };
}

// San Francisco Day 2 (domain model 5.1) with only First Awakenings selected, and the
// stays' towns where the party sleeps. Its legs aren't routed yet.
export function sanFranciscoDay2(): Planning & WithLegs & { day2: StayDay } {
  const planning = planningFor(newTrip(OWNER, PLANNED_AT, EXAMPLE_SETTINGS));
  const { itinerary, services } = planning;
  services.itinerary.setStartPlace(
    itinerary,
    placeAt("San Francisco", 37.7749, -122.4194),
  );
  itinerary.endPlace = placeAt("Mike's house", 34.09, -118.27);
  services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 5, 13));
  const monterey = addStay(planning, MONTEREY, null);
  const day2 = present(addStay(planning, SAN_LUIS_OBISPO, monterey).days[0]);
  const breakfast = meal({
    purpose: "breakfast before the drive",
    searchArea: "nearStay",
    stay: monterey,
  });
  services.stops.addStops(itinerary, day2, [breakfast], null);
  pick(planning, breakfast, FIRST_AWAKENINGS);
  return { ...planning, ...legsFor(planning), day2 };
}

function addStay(planning: Planning, place: Place, after: Stay | null): Stay {
  return planning.services.stays.addStay(planning.itinerary, {
    place,
    nightCount: 1,
    after,
  });
}

// Adds a stop for lunch at Nepenthe, after `after`, or first when it's null.
export function addNepentheLunch(
  planning: Planning & { day2: StayDay },
  after: "first" | "afterBreakfast",
): void {
  const lunch = meal({ purpose: "a view with lunch", searchArea: "alongLeg" });
  planning.services.stops.addStops(
    planning.itinerary,
    planning.day2,
    [lunch],
    after === "first" ? null : (planning.day2.stops[0] ?? null),
  );
  pick(planning, lunch, NEPENTHE);
}

// The Moab trip, with every leg routed once by the fake, so a test starts from legs that
// fit, and no calls recorded.
export async function settledMoab(): Promise<
  MoabExample & Planning & WithLegs
> {
  const example = moabExample();
  const planning = { ...example, itinerary: example.trip.itinerary };
  const withLegs = legsFor(planning);
  await withLegs.legs.updateLegs(planning.itinerary);
  forgetCalls(withLegs.finder);
  return { ...planning, ...withLegs };
}

export function forgetCalls(finder: FakeRouteFinder): void {
  finder.routes.length = 0;
  finder.bestOrders.length = 0;
}

// The names of the places a route goes through, between its start and end.
export function namesOf(path: RoutePath | undefined): string[] {
  return (path?.through ?? []).map(
    (point) =>
      `${point.place.name ?? ""}${point.isPassThrough ? " (pass through)" : ""}`,
  );
}

export function changeOf(changes: readonly LegChange[], day: Day): LegChange {
  return present(changes.find((change) => change.day === day));
}
