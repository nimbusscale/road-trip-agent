import { RouteTypeApproval } from "./approval.js";
import type { Calendar } from "./calendar.js";
import { CalendarDate } from "./calendar-date.js";
import {
  at,
  attraction,
  calendarFor,
  fillDay,
  lodgeAt,
  meal,
  OWNER,
  type PickedStop,
  placeNamed,
  routeDay,
} from "./example-trip-parts.fake.js";
import type { Place } from "./place.js";
import { examplePlace } from "./place.fake.js";
import { newStay, type Stay } from "./stay.js";
import type { Stop } from "./stop.js";
import { newTrip, type Trip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";

// Three days on the road, San Francisco to Mike's house in Los Angeles (domain model
// 5.1), for tests. The drive times and visit times are made up, so the schedule's times
// come out as the example shows them.

export interface SanFranciscoExample {
  trip: Trip;
  calendar: Calendar;
  monterey: Stay;
  sanLuisObispo: Stay;
  // Day 2's dinner, set for 6:30, and its place.
  firestone: Stop;
  firestoneGrill: Place;
  // Day 2's segment drive times, without the buffer.
  day2Segments: readonly number[];
}

const DAY_2_SEGMENTS = [9, 13, 13, 31, 81, 54, 4, 5];

export function sanFranciscoExample(): SanFranciscoExample {
  const trip = newTrip(OWNER, new Date("2026-10-15T16:00:00Z"));
  const calendar = calendarFor(trip);
  const itinerary = trip.itinerary;
  itinerary.startPlace = examplePlace({
    name: "San Francisco",
    googlePlaceId: "google-San Francisco",
    latitude: 37.7749,
    longitude: -122.4194,
  });
  const mikesHouse = examplePlace({
    name: null,
    type: null,
    googlePlaceId: "google-Mike's house",
    address: "1234 Silver Lake Blvd, Los Angeles, CA 90026, USA",
    openingPeriods: [],
  });
  mikesHouse.fillName("Mike's house");
  itinerary.endPlace = mikesHouse;
  itinerary[VIA_SERVICE].setStartDate(new CalendarDate(2027, 5, 13));
  const monterey = addStay(trip, "Monterey", null);
  const sanLuisObispo = addStay(trip, "San Luis Obispo", monterey);
  layOutDay1(monterey);
  routeDay(calendar, itinerary, monterey.days[0], [22, 22, 13, 45, 40, 5]);
  const { firestone, firestoneGrill } = layOutDay2(monterey, sanLuisObispo);
  const day2 = sanLuisObispo.days[0];
  routeDay(calendar, itinerary, day2, DAY_2_SEGMENTS);
  day2?.setWaypoints([placeNamed("Big Sur village")]);
  routeDay(calendar, itinerary, itinerary.lastDay, [218]);
  itinerary.lastDay[VIA_SERVICE].setApproval(
    new RouteTypeApproval({
      reason: "we want to get to LA quickly",
      approvedRouteType: "fastest",
    }),
  );
  return {
    trip,
    calendar,
    monterey,
    sanLuisObispo,
    firestone,
    firestoneGrill,
    day2Segments: DAY_2_SEGMENTS,
  };
}

function addStay(trip: Trip, town: string, after: Stay | null): Stay {
  const stay = newStay({
    place: placeNamed(town),
    nightCount: 1,
    tier: "value",
    tierRule: "the trip default",
  });
  trip.itinerary[VIA_SERVICE].placeStay(stay, after);
  lodgeAt(stay, placeNamed(`${town} hotel`));
  return stay;
}

// All five named by the user.
function layOutDay1(monterey: Stay): void {
  const stops: [Stop, string, number][] = [
    [
      meal({ purpose: "pancakes", searchArea: "alongLeg" }),
      "Millbrae Pancake House",
      60,
    ],
    [
      attraction({ purpose: "airships", searchArea: "alongLeg" }),
      "Hangar One, Moffett Field",
      120,
    ],
    [
      meal({ purpose: "coffee", searchArea: "alongLeg" }),
      "Philz Coffee, San Jose",
      60,
    ],
    [
      attraction({ purpose: "the boardwalk", searchArea: "alongLeg" }),
      "Santa Cruz Beach Boardwalk",
      180,
    ],
    [
      meal({
        purpose: "seafood",
        searchArea: "nearStay",
        stay: monterey,
        setTime: at("19:00"),
      }),
      "The Whaling Station",
      60,
    ],
  ];
  fillDay(
    monterey.days[0],
    stops.map(([stop, name, visit]) => [stop, placeNamed(name), visit]),
  );
}

function layOutDay2(
  monterey: Stay,
  sanLuisObispo: Stay,
): { firestone: Stop; firestoneGrill: Place } {
  const firestone = meal({
    purpose: "tri-tip",
    searchArea: "nearStay",
    stay: sanLuisObispo,
    setTime: at("18:30"),
  });
  const firestoneGrill = placeNamed("Firestone Grill, San Luis Obispo");
  fillDay(sanLuisObispo.days[0], [
    ...day2Stops(monterey),
    [firestone, firestoneGrill, 60],
    [
      meal({ purpose: "dessert", searchArea: "nearStay", stay: sanLuisObispo }),
      placeNamed("Copper Café, Madonna Inn"),
      60,
    ],
  ]);
  return { firestone, firestoneGrill };
}

// Before the dinner.
function day2Stops(monterey: Stay): PickedStop[] {
  return [
    [
      meal({
        purpose: "breakfast before the drive",
        searchArea: "nearStay",
        stay: monterey,
      }),
      placeNamed("First Awakenings, Monterey"),
      60,
    ],
    [
      attraction({ purpose: "coastal walk", searchArea: "alongLeg" }),
      placeNamed("Point Lobos State Natural Reserve"),
      90,
    ],
    [
      attraction({ purpose: "the bridge", searchArea: "alongLeg" }),
      placeNamed("Bixby Creek Bridge viewpoint"),
      20,
    ],
    [
      meal({ purpose: "a view with lunch", searchArea: "alongLeg" }),
      placeNamed("Nepenthe, Big Sur"),
      60,
    ],
    [
      attraction({ purpose: "elephant seals", searchArea: "alongLeg" }),
      placeNamed("Piedras Blancas elephant seal rookery"),
      60,
    ],
  ];
}
