import { describe, expect, it } from "vitest";

import type {
  ItineraryResponse,
  ShownChoice,
  ShownDay,
  ShownEntry,
  ShownPlace,
} from "../../src/shared/itinerary.schema";
import { mapMarkers, mapPositions, routeLines } from "./map-items";

function place(name: string, latitude: number, longitude: number): ShownPlace {
  return {
    id: name,
    name,
    address: `${name}, CA`,
    latitude,
    longitude,
  };
}

const SAN_FRANCISCO = place("San Francisco", 37.77, -122.42);
const MONTEREY = place("Monterey", 36.6, -121.89);
const MONTEREY_HOTEL = place("Monterey hotel", 36.61, -121.9);
const SAN_LUIS_OBISPO = place("San Luis Obispo", 35.28, -120.66);
const PANCAKE_HOUSE = place("Millbrae Pancake House", 37.6, -122.39);

function picked(chosen: ShownPlace, namedByUser: boolean): ShownChoice {
  return {
    status: "selected",
    candidateCount: 1,
    selection: {
      place: chosen,
      rationale: `Why ${chosen.name}.`,
      namedByUser,
      sourceLink: namedByUser ? null : "https://maps.google.com/?cid=1",
    },
    card: null,
  };
}

const NOT_PICKED: ShownChoice = {
  status: "proposed",
  candidateCount: 3,
  selection: null,
  card: { options: [], higherTier: true, lowerTier: true },
};

function stopEntry(
  id: string,
  kind: "meal" | "attraction",
  choice: ShownChoice,
): ShownEntry {
  const known = choice.selection !== null;
  return {
    kind: "stop",
    startTime: known ? "8:25 a.m." : null,
    endTime: known ? "9:10 a.m." : null,
    duration: null,
    stop: {
      id,
      number: 1,
      kind,
      purpose: "breakfast",
      setTime: null,
      choice,
      checkInPlace: null,
    },
  };
}

const DRIVE: ShownEntry = {
  kind: "drive",
  startTime: "8:00 a.m.",
  endTime: "8:25 a.m.",
  duration: "25 m",
  stop: null,
};

interface LegEnds {
  from: ShownPlace;
  to: ShownPlace;
  routeLine: string | null;
}

function day(
  number: number,
  { from, to, routeLine }: LegEnds,
  schedule: ShownEntry[],
): ShownDay {
  return {
    id: `day-${String(number)}`,
    number,
    date: null,
    location: null,
    startTime: "8:00 a.m.",
    isRestDay: false,
    isLastDay: false,
    leg: {
      from,
      to,
      driveTime: null,
      distanceInMiles: null,
      routeLine,
      stopsAlongTheWay: [],
      routeType: null,
    },
    schedule,
    arrival: null,
  };
}

// Day 1 has its lodging and breakfast picked, and its line routed. Day 2 has neither.
function view(): ItineraryResponse {
  return {
    summary: {
      name: null,
      startDate: "2027-05-13",
      endDate: "2027-05-15",
      startPlace: SAN_FRANCISCO,
      endPlace: SAN_LUIS_OBISPO,
      totalDriveTime: "5 h",
      dayCount: 2,
      stayCount: 2,
    },
    stays: [
      {
        id: "stay-1",
        number: 1,
        place: MONTEREY,
        nightCount: 1,
        arriveDate: "2027-05-13",
        leaveDate: "2027-05-14",
        lodging: picked(MONTEREY_HOTEL, false),
        weather: null,
      },
      {
        id: "stay-2",
        number: 2,
        place: SAN_LUIS_OBISPO,
        nightCount: 2,
        arriveDate: null,
        leaveDate: null,
        lodging: NOT_PICKED,
        weather: null,
      },
    ],
    days: [
      day(
        1,
        { from: SAN_FRANCISCO, to: MONTEREY_HOTEL, routeLine: "encoded-day-1" },
        [
          DRIVE,
          stopEntry("stop-1", "meal", picked(PANCAKE_HOUSE, true)),
          stopEntry("stop-2", "attraction", NOT_PICKED),
        ],
      ),
      day(
        2,
        { from: MONTEREY_HOTEL, to: SAN_LUIS_OBISPO, routeLine: null },
        [],
      ),
    ],
  };
}

describe("the itinerary map", () => {
  it("puts a stay at its lodging once one is picked, and in its town until then", () => {
    const [first, second] = mapMarkers(view());
    expect(first).toEqual({
      key: "stay-1",
      kind: "stay",
      place: MONTEREY_HOTEL,
      heading: "Stay 1: Monterey",
      details: [
        "1 night, Thu, May 13, 2027 to Fri, May 14, 2027",
        "Lodging: Monterey hotel",
        "Monterey hotel, CA",
      ],
      selection: picked(MONTEREY_HOTEL, false).selection,
    });
    expect(second).toEqual({
      key: "stay-2",
      kind: "stay",
      place: SAN_LUIS_OBISPO,
      heading: "Stay 2: San Luis Obispo",
      details: ["2 nights", "Lodging: not picked yet"],
      selection: null,
    });
  });

  it("marks a meal's place as a restaurant, and leaves out a stop with no place picked", () => {
    const stops = mapMarkers(view()).filter((marker) => marker.kind !== "stay");
    expect(stops).toEqual([
      {
        key: "stop-1",
        kind: "restaurant",
        place: PANCAKE_HOUSE,
        heading: "Millbrae Pancake House",
        details: [
          "Day 1, 8:25 a.m. – 9:10 a.m.",
          "Meal: breakfast",
          "Millbrae Pancake House, CA",
        ],
        selection: picked(PANCAKE_HOUSE, true).selection,
      },
    ]);
  });

  it("draws a line only for a leg Google has routed", () => {
    expect(routeLines(view())).toEqual([
      { key: "day-1", encodedPath: "encoded-day-1" },
    ]);
  });

  it("zooms to each leg's ends, as well as the markers", () => {
    expect(mapPositions(view())).toEqual([
      MONTEREY_HOTEL,
      SAN_LUIS_OBISPO,
      PANCAKE_HOUSE,
      SAN_FRANCISCO,
      MONTEREY_HOTEL,
      MONTEREY_HOTEL,
      SAN_LUIS_OBISPO,
    ]);
  });
});
