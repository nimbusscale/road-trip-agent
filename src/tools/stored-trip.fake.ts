import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import type { Trip } from "../domain/trip.js";
import { PLANNED_AT } from "../domain/example-trip-parts.fake.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { readItineraryTool } from "./itinerary-tools.js";
import type { ToolReply } from "./tool-reply.js";

// read_itinerary over a trip built in memory, with the clock at the time the example
// trips are planned.
export async function readerFor(
  trip: Trip,
): Promise<(scope: string) => Promise<ToolReply>> {
  const fixture = setUp();
  await storeTrip(fixture, trip);
  const tool = readItineraryTool({
    ...fixture,
    tripId: trip.id,
    now: () => PLANNED_AT,
  });
  return (scope) => tool.handler({ scope });
}

export function textOf(reply: ToolReply): string {
  return reply.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

// Saves a trip built in memory, such as an example trip, to the fake store, with every
// place it links to, so a tool can read it back (DEVELOPMENT.md section 5).
export async function storeTrip(
  fixture: ReturnType<typeof setUp>,
  trip: Trip,
): Promise<void> {
  await fixture.store.add(trip);
  const places = new Map(
    placesIn(trip.itinerary).map((place) => [place.id, place]),
  );
  fixture.store.places.rows.push(
    ...[...places.values()].map((place) => ({ tripId: trip.id, place })),
  );
}

function placesIn(itinerary: Itinerary): Place[] {
  const ends = [itinerary.startPlace, itinerary.endPlace].filter(
    (place) => place !== null,
  );
  const stays = itinerary.stays.flatMap((stay) => [
    stay.place,
    ...stay.lodgingCandidates.map((candidate) => candidate.place),
    ...(stay.weatherText === null ? [] : [stay.weatherText.writtenForPlace]),
  ]);
  const days = itinerary.days.flatMap((day) => [
    ...day.waypoints,
    ...day.stops.flatMap((stop) =>
      stop.candidates.map((candidate) => candidate.place),
    ),
    ...(day.leg === null
      ? []
      : [
          day.leg.routedFromPlace,
          day.leg.routedToPlace,
          ...day.leg.routedStopPlaces,
          ...day.leg.routedWaypoints,
        ]),
  ]);
  const rejected = itinerary.rejectedPlaces.map((each) => each.place);
  return [...ends, ...stays, ...days, ...rejected];
}
