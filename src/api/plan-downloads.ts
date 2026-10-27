import type { Place } from "../domain/place.js";
import type { Trip } from "../domain/trip.js";
import { placeDocumentOf } from "../persistence/place-document.js";
import { planDocumentOf } from "../persistence/plan-document.js";

// The trip brief and the itinerary, for the user to download from the chat view
// (functional spec 10.1). Two forms:
//
// - stored: the plan document as it's stored, and the places it links to, as stored.
// - readable: the plan document with each place's name and address where it has the
//   place's ID, and without route lines, which only a map can read.

const ID = "Id";
const IDS = "Ids";
const LEFT_OUT = new Set(["routeLine"]);

interface PlaceShown {
  name: string | null;
  address: string;
}

type ShownPlaces = ReadonlyMap<string, PlaceShown>;

export function storedPlanOf(trip: Trip, places: readonly Place[]): object {
  const plan = planDocumentOf(trip);
  const linked = new Set(textsIn(plan));
  return {
    plan,
    places: places.filter((place) => linked.has(place.id)).map(placeDocumentOf),
  };
}

export function readablePlanOf(trip: Trip, places: readonly Place[]): unknown {
  const shown: ShownPlaces = new Map(
    places.map((place) => [
      place.id,
      { name: place.name, address: place.address },
    ]),
  );
  return readableOf(planDocumentOf(trip), shown);
}

// Every text value in the document, at any depth. The place IDs are among them.
function textsIn(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).flatMap(textsIn);
}

function readableOf(value: unknown, places: ShownPlaces): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => readableOf(item, places));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !LEFT_OUT.has(key))
      .map(([key, item]: [string, unknown]) =>
        readableEntryOf(key, item, places),
      ),
  );
}

// A link to a place loses "Id" from its name, such as selectedPlaceId to
// selectedPlace, and a list of them "Ids", such as routedWaypointIds to
// routedWaypoints. A link that's empty keeps its name.
function readableEntryOf(
  key: string,
  item: unknown,
  places: ShownPlaces,
): [string, unknown] {
  if (key.endsWith(ID) && typeof item === "string") {
    const place = places.get(item);
    if (place !== undefined) {
      return [key.slice(0, -ID.length), place];
    }
  }
  if (key.endsWith(IDS) && Array.isArray(item) && item.length > 0) {
    const linked = item.map((id: unknown) =>
      typeof id === "string" ? places.get(id) : undefined,
    );
    if (linked.every((place) => place !== undefined)) {
      return [`${key.slice(0, -IDS.length)}s`, linked];
    }
  }
  return [key, readableOf(item, places)];
}
