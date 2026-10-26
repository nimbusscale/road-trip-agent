import type { Candidate } from "../domain/candidate.js";
import type { Day } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import type { Stay } from "../domain/stay.js";
import {
  type Positions,
  stayName,
  stayNumber,
  stopName,
} from "./spot-names.js";

// The places the itinerary holds, for find_in_trip (tool design 2.1): every stop's and
// stay's candidates, the rejected places, the start and end places, and the stays'
// towns. Not every place saved for the trip: each search saves its results, and most
// were never offered.

// One place, with a line for each spot the itinerary holds it in, such as a hotel
// that's also a dinner candidate.
export interface PlaceInTrip {
  readonly place: Place;
  readonly spotLines: readonly string[];
}

type Spot = readonly [Place, string];

// Each place once, in the order the whole read first lists it, with its spots in the
// order the whole read lists them.
export function placesInTrip(positions: Positions): PlaceInTrip[] {
  const byId = new Map<string, { place: Place; spotLines: string[] }>();
  for (const [place, line] of spotsOf(positions)) {
    const found = byId.get(place.id);
    if (found === undefined) {
      byId.set(place.id, { place, spotLines: [line] });
    } else {
      found.spotLines.push(line);
    }
  }
  return [...byId.values()];
}

// The whole read's order: the start and end places, each stay with its town, its
// lodging candidates, and its days' stops, then the last day's stops, then the
// rejected places.
function spotsOf(positions: Positions): Spot[] {
  const { itinerary } = positions;
  return [
    ...endSpots(itinerary),
    ...itinerary.stays.flatMap((stay) => staySpots(positions, stay)),
    ...daySpots(positions, itinerary.lastDay),
    ...itinerary.rejectedPlaces.map((each): Spot => [
      each.place,
      `Rejected for the whole trip: "${each.reason}".`,
    ]),
  ];
}

// A loop's start and end are one place, so it gets one line.
function endSpots(itinerary: Itinerary): Spot[] {
  const { startPlace, endPlace } = itinerary;
  if (startPlace !== null && startPlace.id === endPlace?.id) {
    return [[startPlace, "The start and end place."]];
  }
  return [
    ...(startPlace === null ? [] : [[startPlace, "The start place."] as const]),
    ...(endPlace === null ? [] : [[endPlace, "The end place."] as const]),
  ];
}

function staySpots(positions: Positions, stay: Stay): Spot[] {
  const where = stayName(positions, stay);
  return [
    [stay.place, `The town of ${stayNumber(positions, stay)} (${stay.id}).`],
    ...stay.lodgingCandidates.map((candidate): Spot => [
      candidate.place,
      `Lodging candidate for ${where}, ${candidateText(candidate, stay.lodging)}`,
    ]),
    ...stay.days.flatMap((day) => daySpots(positions, day)),
  ];
}

function daySpots(positions: Positions, day: Day): Spot[] {
  return day.stops.flatMap((stop) => {
    const where = stopName(positions, stop);
    return stop.candidates.map((candidate): Spot => [
      candidate.place,
      `Candidate for ${where}, ${candidateText(candidate, stop.selectedPlace)}`,
    ]);
  });
}

// Such as "set 1. Selected." Sets are counted from 1, as people count them.
function candidateText(candidate: Candidate, selected: Place | null): string {
  const isSelected = candidate.place.id === selected?.id;
  return `set ${String(candidate.setNumber + 1)}. ${isSelected ? "Selected." : "Not selected."}`;
}
