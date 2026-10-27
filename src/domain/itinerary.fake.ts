import {
  DriveHoursApproval,
  OpeningHoursApproval,
  RouteTypeApproval,
} from "./approval.js";
import { CalendarDate } from "./calendar-date.js";
import type { CandidateOffer } from "./candidate.js";
import { CheckResult } from "./check-result.js";
import { Leg } from "./leg.js";
import type { Place } from "./place.js";
import { examplePlace } from "./place.fake.js";
import { RejectedPlace } from "./rejected-place.js";
import { ScheduleTime } from "./schedule-time.js";
import { newStay, type Stay } from "./stay.js";
import type { StayDay } from "./stay-day.js";
import { newStop, type NewStopFields, type Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip, type Trip } from "./trip.js";
import type { User } from "./user.js";
import { VIA_SERVICE } from "./via-service.js";
import { Waypoint } from "./waypoint.js";
import { ActivityRecord, WeatherText } from "./weather-text.js";

// A trip for tests, like the Moab example (domain model 5.2), with something of every
// kind: stays, days, a rest day, stops with candidates and set times, approvals, legs,
// waypoints, weather text, a rejected place, and check results. It's built the way
// the services will build it, with the objects' change methods.

export interface ExampleTrip {
  trip: Trip;
  places: Place[];
  moab: Stay;
  milts: Stop;
}

export function exampleMoabTrip(owner: User): ExampleTrip {
  const places = examplePlaces();
  const trip = newTrip(owner, new Date("2026-10-15T09:00:00Z"));
  const itinerary = trip.itinerary;
  itinerary[VIA_SERVICE].setStartPlace(places.grandJunction);
  itinerary.endPlace = places.saltLakeCity;
  itinerary[VIA_SERVICE].setStartDate(new CalendarDate(2027, 10, 10));
  const moab = newStay({
    place: places.moab,
    nightCount: 3,
    tier: "midRange",
    tierRule: "stays of 2+ nights",
  });
  const torrey = newStay({
    place: places.torrey,
    nightCount: 1,
    tier: "value",
    tierRule: "the trip default",
  });
  itinerary[VIA_SERVICE].placeStay(moab, null);
  itinerary[VIA_SERVICE].placeStay(torrey, moab);
  moab[VIA_SERVICE].addLodgingCandidates([
    workerOffer(places.moabHotel),
    workerOffer(places.otherMoabHotel),
  ]);
  moab.selectCandidate(places.moabHotel);
  const milts = layOutMoab(moab, places);
  approveDays(trip, torrey);
  finishPlan(trip, moab, milts, places);
  return { trip, places: Object.values(places), moab, milts };
}

function layOutMoab(moab: Stay, places: ExamplePlaces): Stop {
  const [day1, day2, day3] = moab.days;
  const brewery = mealStop("dinner", "nearStay", moab, at("18:00"));
  const fisherTowers = attractionStop("Fisher Towers", "alongLeg", null);
  day1?.[VIA_SERVICE].placeStops([fisherTowers, brewery], null);
  fisherTowers[VIA_SERVICE].addCandidates([
    {
      ...workerOffer(places.fisherTowers),
      visitTimeInMinutes: 60,
      detourTimeInMinutes: 10,
    },
  ]);
  fisherTowers[VIA_SERVICE].selectCandidate(places.fisherTowers, 60);
  brewery[VIA_SERVICE].addCandidates([workerOffer(places.moabBrewery)]);
  brewery[VIA_SERVICE].selectCandidate(places.moabBrewery, 75);
  const milts = mealStop("burgers and shakes", "nearStay", moab, at("12:00"));
  const sunrise = attractionStop(
    "a sunrise hike",
    "nearStay",
    moab,
    at("06:00"),
  );
  if (day2 !== undefined) {
    day2.ownStartTime = TimeOfDay.fromText("05:30");
    day2[VIA_SERVICE].placeStops([sunrise, milts], null);
  }
  milts[VIA_SERVICE].addCandidates([workerOffer(places.milts)]);
  milts[VIA_SERVICE].selectCandidate(places.milts, 45);
  milts[VIA_SERVICE].setApproval(
    new OpeningHoursApproval({
      reason: "we'll eat fast",
      approvedOpenTimeInMinutes: 30,
    }),
  );
  day3?.[VIA_SERVICE].placeStops(
    [mealStop("dinner near the hotel", "nearStay", moab, at("18:30"))],
    null,
  );
  day3?.[VIA_SERVICE].setRestDay(true);
  if (day1 !== undefined) {
    routeDay1(day1, places);
  }
  return milts;
}

function routeDay1(day1: StayDay, places: ExamplePlaces): void {
  day1[VIA_SERVICE].setLeg(
    new Leg({
      segmentDriveTimesInMinutes: [95, 25, 10],
      distanceInMiles: 112.4,
      routeLine: "_p~iF~ps|U_ulLnnqC",
      stopsInBestOrder: [...day1.stops].reverse(),
      timeSavedInMinutes: 4,
      routedFromPlace: places.grandJunction,
      routedToPlace: places.moabHotel,
      routedStopPlaces: [places.fisherTowers, places.moabBrewery],
      routedWaypoints: [places.deweyBridge],
    }),
  );
  day1.setWaypoints([
    new Waypoint({ place: places.deweyBridge, reason: "steer onto UT-128" }),
  ]);
}

function approveDays(trip: Trip, torrey: Stay): void {
  torrey.days[0]?.[VIA_SERVICE].setApproval(
    new DriveHoursApproval({
      reason: "we want to see the hoodoos and Capitol Reef on the way",
      approvedDrivingInHours: 5,
    }),
  );
  trip.itinerary.lastDay[VIA_SERVICE].setApproval(
    new RouteTypeApproval({
      reason: "get home quickly",
      approvedRouteType: "fastest",
    }),
  );
}

function finishPlan(
  trip: Trip,
  moab: Stay,
  milts: Stop,
  places: ExamplePlaces,
): void {
  moab[VIA_SERVICE].setWeatherText(
    new WeatherText({
      guidance: "Cool mornings, warm afternoons. Layers for the sunrise hike.",
      label: "seasonalAverages",
      writtenOnDate: new CalendarDate(2026, 10, 15),
      writtenForPlace: places.moab,
      writtenForDates: [
        new CalendarDate(2027, 10, 10),
        new CalendarDate(2027, 10, 13),
      ],
      writtenForActivities: [
        new ActivityRecord({
          stopId: moab.days[0]?.stops[0]?.id ?? "",
          selectedPlace: places.fisherTowers,
        }),
      ],
    }),
  );
  trip.itinerary[VIA_SERVICE].addRejectedPlace(
    new RejectedPlace({
      place: places.kitschyMotel,
      reason: "too kitschy for us",
    }),
  );
  trip.itinerary.replaceCheckResults([
    new CheckResult({
      check: "openingHoursNotLongEnough",
      subjectId: milts.id,
      text: "Milt's closes at 12:30 p.m. You'd get there at noon.",
      isApproved: true,
      hasUnselectedStopBefore: true,
    }),
  ]);
  trip.tripBrief.focus = "Arches and Capitol Reef";
}

function mealStop(
  purpose: string,
  searchArea: NewStopFields["searchArea"],
  stay: Stay | null,
  setTime: ScheduleTime | null,
): Stop {
  return newStop({
    kind: "meal",
    purpose,
    searchArea,
    searchAreaStay: stay,
    setTime,
    tier: "value",
    tierRule: "the trip default",
  });
}

function attractionStop(
  purpose: string,
  searchArea: NewStopFields["searchArea"],
  stay: Stay | null,
  setTime: ScheduleTime | null = null,
): Stop {
  return newStop({
    kind: "attraction",
    purpose,
    searchArea,
    searchAreaStay: stay,
    setTime,
    tier: null,
    tierRule: null,
  });
}

function at(text: string): ScheduleTime {
  return new ScheduleTime(TimeOfDay.fromText(text), false);
}

// What a worker passes in for a place it found on Google.
export function workerOffer(place: Place): CandidateOffer {
  return {
    place,
    rationale: "Fits the trip.",
    howFound: "google",
    sourceLink: place.links[0] ?? "https://maps.google.com/",
    notesText: null,
    visitTimeInMinutes: null,
    detourTimeInMinutes: null,
  };
}

// A place the user named.
export function userOffer(place: Place): CandidateOffer {
  return {
    ...workerOffer(place),
    howFound: "specifiedByUser",
    sourceLink: null,
    rationale: "The user's pick.",
  };
}

// A place with its own name and Google place ID, so a trip can hold many.
export function namedPlace(name: string): Place {
  return examplePlace({ name, googlePlaceId: `google-${name}` });
}

type ExamplePlaces = ReturnType<typeof examplePlaces>;

function examplePlaces() {
  return {
    // Its own coordinates, so today's date comes from Mountain time.
    grandJunction: examplePlace({
      name: "Grand Junction",
      googlePlaceId: "google-Grand Junction",
      latitude: 39.0639,
      longitude: -108.5506,
    }),
    saltLakeCity: namedPlace("Salt Lake City"),
    moab: examplePlace({
      name: "Moab",
      googlePlaceId: "google-Moab",
      latitude: 38.5733,
      longitude: -109.5498,
    }),
    moabHotel: namedPlace("Moab hotel"),
    otherMoabHotel: namedPlace("Other Moab hotel"),
    torrey: namedPlace("Torrey"),
    deweyBridge: namedPlace("Dewey Bridge"),
    fisherTowers: namedPlace("Fisher Towers"),
    moabBrewery: namedPlace("Moab Brewery"),
    milts: namedPlace("Milt's Stop & Eat"),
    kitschyMotel: namedPlace("Kitschy motel"),
  };
}

// For tests: the value, or a failed test when it's missing.
export function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Something this test needs is missing.");
  }
  return value;
}
