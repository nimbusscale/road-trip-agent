import type { CandidateOffer } from "./candidate.js";
import { CalendarDate } from "./calendar-date.js";
import type { Day } from "./day.js";
import {
  attraction,
  at,
  meal,
  OWNER,
  type Planning,
  planningFor,
  routeDay,
  EXAMPLE_SETTINGS,
} from "./example-trip-parts.fake.js";
import { OpeningPeriod } from "./opening-period.js";
import type { Place } from "./place.js";
import { examplePlace } from "./place.fake.js";
import { RejectedPlace } from "./rejected-place.js";
import type { Stay } from "./stay.js";
import type { Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip, type Trip } from "./trip.js";
import { WEEKDAYS } from "./weekday.js";

// A full 14-day trip, for measuring the size of a whole read_itinerary (tool design
// 2.1): a Southwest loop from Las Vegas with 8 stays, five stops a day, three candidates
// for each stop and stay, and "more options" rounds on about one in four of them. Every
// place has the length of a real Google record's name, type, and address. Built through
// the services, like the other example trips.

const LOOP: readonly [string, number][] = [
  ["Springdale", 2],
  ["Bryce Canyon City", 1],
  ["Torrey", 1],
  ["Moab", 3],
  ["Cortez", 2],
  ["Mexican Hat", 1],
  ["Page", 1],
  ["Tusayan", 2],
];

const RATIONALE =
  "A local favorite with a short wait, and a menu that fits the group's taste for regional food.";
const NOTES = "Closed Mondays. Reservations advised on weekends.";
const WEATHER =
  "Warm, dry days in the 80s, and cool nights in the low 50s. Afternoon thunderstorms are possible, so start hikes early and carry a rain shell. Pack layers for sunrise, sun hats, and sturdy shoes for slickrock. Bring a warm jacket for stargazing.";

// Every place open 7 a.m. to 10 p.m., so the read has few hours notes.
const DAILY_HOURS = WEEKDAYS.map(
  (day) =>
    new OpeningPeriod({
      openDay: day,
      openTime: new TimeOfDay(7, 0),
      closeDay: day,
      closeTime: new TimeOfDay(22, 0),
    }),
);

let placeCount = 0;

function placeFor(town: string, kind: string): Place {
  placeCount += 1;
  const name = `${town} ${kind} ${String(placeCount)}`;
  return examplePlace({
    name,
    googlePlaceId: `google-${name}`,
    type: kind === "hotel" ? "Hotel" : "Mexican Restaurant",
    address: `${String(100 + placeCount)} N Main St, ${town}, UT 84532, USA`,
    openingPeriods: DAILY_HOURS,
  });
}

function offer(place: Place, stop: Stop | null): CandidateOffer {
  const isAttraction = stop?.kind === "attraction";
  return {
    place,
    rationale: RATIONALE,
    howFound: "google",
    sourceLink: `https://maps.google.com/?cid=${String(9_000_000 + placeCount)}`,
    notesText: placeCount % 2 === 0 ? NOTES : null,
    tier: isAttraction ? null : "midRange",
    visitTimeInMinutes: isAttraction ? 90 : null,
    detourTimeInMinutes: stop?.searchArea === "alongLeg" ? 12 : null,
  };
}

export interface FourteenDayExample {
  trip: Trip;
  planning: Planning;
}

export function fourteenDayExample(): FourteenDayExample {
  placeCount = 0;
  const trip = newTrip(
    OWNER,
    new Date("2026-10-15T16:00:00Z"),
    EXAMPLE_SETTINGS,
  );
  const planning = planningFor(trip);
  const { itinerary, services } = planning;
  services.tripBrief.setTripLength(trip.tripBrief, 14);
  services.tripBrief.setComfortableDriving(trip.tripBrief, 5);
  const lasVegas = examplePlace({
    name: "Las Vegas",
    googlePlaceId: "google-Las Vegas",
    type: "City",
    address: "Las Vegas, NV, USA",
    latitude: 36.1716,
    longitude: -115.1391,
  });
  services.itinerary.setStartPlace(itinerary, lasVegas);
  itinerary.endPlace = lasVegas;
  services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 9, 12));
  let after: Stay | null = null;
  for (const [town, nights] of LOOP) {
    after = addStay(planning, town, nights, after);
  }
  itinerary.days.forEach((day, index) => {
    layOutDay(planning, day, index);
  });
  for (const stay of itinerary.stays) {
    services.stays.setWeatherText(itinerary, stay, WEATHER);
  }
  rejectSome(planning);
  return { trip, planning };
}

function addStay(
  planning: Planning,
  town: string,
  nightCount: number,
  after: Stay | null,
): Stay {
  const { itinerary, services } = planning;
  const stay = services.stays.addStay(itinerary, {
    place: examplePlace({
      name: town,
      googlePlaceId: `google-${town}`,
      type: "City",
      address: `${town}, UT, USA`,
    }),
    nightCount,
    after,
  });
  for (const offers of setsOf(town, null)) {
    services.stays.addLodgingCandidates(itinerary, stay, offers);
  }
  stay.selectCandidate(stay.lodgingCandidates[0]?.place ?? stay.place);
  return stay;
}

// Five stops: breakfast, two sights, lunch, and dinner. A day that moves to a new stay
// has its sights and lunch along the leg.
function layOutDay(planning: Planning, day: Day, index: number): void {
  const { itinerary, calendar, services } = planning;
  const start = calendar.startStayOf(itinerary, day);
  const end = calendar.endStayOf(itinerary, day);
  const town = (end ?? start)?.place.name ?? "Las Vegas";
  const moves = !calendar.isStayingPut(itinerary, day);
  const away = moves
    ? ({ searchArea: "alongLeg" } as const)
    : near(end, "nearEndPlace");
  const stops = [
    meal({ purpose: "breakfast", ...near(start, "nearStartPlace") }),
    attraction({ purpose: "a morning hike", ...away }),
    meal({ purpose: "lunch", ...away }),
    attraction({ purpose: "an afternoon viewpoint", ...away }),
    meal({
      purpose: "dinner",
      ...near(end, "nearEndPlace"),
      setTime: at("18:30"),
    }),
  ];
  services.stops.addStops(itinerary, day, stops, null);
  for (const stop of stops) {
    for (const offers of setsOf(town, stop)) {
      services.stops.addCandidates(itinerary, stop, offers);
    }
    const first = stop.candidates[0];
    if (first !== undefined) {
      services.stops.selectCandidate(stop, first.place);
    }
  }
  routeDay(calendar, itinerary, day, [25, 40, 35, 30, 45, 20]);
  if (index % 5 === 3) {
    services.days.approveDriveHours(
      day,
      6,
      "the user wants the long scenic way",
    );
  }
}

// A stop near its stay, or near the start or end place on the first and last days.
function near(stay: Stay | null, otherwise: "nearStartPlace" | "nearEndPlace") {
  return stay === null
    ? { searchArea: otherwise }
    : ({ searchArea: "nearStay", stay } as const);
}

// One set of three, and a second set of three for about one in four.
function setsOf(town: string, stop: Stop | null): CandidateOffer[][] {
  const sets = placeCount % 4 === 0 ? 2 : 1;
  const kind = stop === null ? "hotel" : stop.purpose;
  return Array.from({ length: sets }, () =>
    [1, 2, 3].map(() => offer(placeFor(town, kind), stop)),
  );
}

function rejectSome(planning: Planning): void {
  const places = [1, 2, 3, 4].map(() => placeFor("Moab", "motel"));
  planning.services.rejections.rejectPlaces(
    planning.itinerary,
    places.map(
      (place) =>
        new RejectedPlace({ place, reason: "too far from the trailheads" }),
    ),
  );
}
