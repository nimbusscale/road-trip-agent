import { placeNamed } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import type { Place } from "../domain/place.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { setWaypointsTool, updateDayTool } from "./day-tools.js";
import { readItineraryTool } from "./itinerary-tools.js";
import { addStayTool, removeStayTool, updateStayTool } from "./stay-tools.js";
import { storeTrip, textOf } from "./stored-trip.fake.js";
import type { StrictToolDefinition } from "./strict-tool.js";
import type { ToolReply } from "./tool-reply.js";
import type { TripSession } from "./trip-session.js";
import { updateItineraryTool } from "./update-itinerary-tool.js";

// The tools that build the skeleton, over trips in the fake store (DEVELOPMENT.md
// section 5).

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

export type Call = (input: unknown) => Promise<ToolReply>;

export interface Tools {
  updateItinerary: Call;
  addStay: Call;
  updateStay: Call;
  removeStay: Call;
  updateDay: Call;
  setWaypoints: Call;
  read: (scope: string) => Promise<string>;
}

export function toolsFor(session: TripSession): Tools {
  const call =
    (make: (session: TripSession) => StrictToolDefinition): Call =>
    (input) => {
      const tool = make(session);
      // The Agent SDK checks the input against the schema before the handler runs.
      return tool.handler(tool.inputSchema.parse(input));
    };
  return {
    updateItinerary: call(updateItineraryTool),
    addStay: call(addStayTool),
    updateStay: call(updateStayTool),
    removeStay: call(removeStayTool),
    updateDay: call(updateDayTool),
    setWaypoints: call(setWaypointsTool),
    read: async (scope) =>
      textOf(await readItineraryTool(session).handler({ scope })),
  };
}

// A new trip with the Moab example's places saved, as find_place would save them
// (domain model 5.2). The fake route finder gives each segment 30 minutes.
export async function newMoabTrip(): Promise<
  Tools & {
    fixture: ReturnType<typeof setUp>;
    tripId: string;
    place: (name: string) => Place;
    days: () => Promise<string[]>;
  }
> {
  const fixture = setUp();
  const { id: tripId } = await fixture.writer.startTrip(OWNER);
  const stored = await fixture.store.places.addPlaces(
    tripId,
    ["Grand Junction", "Salt Lake City", "Moab", "Torrey", "Dewey Bridge"].map(
      (name) => placeNamed(name),
    ),
  );
  const session = { ...fixture, tripId };
  return {
    ...toolsFor(session),
    fixture,
    tripId,
    place: (name) => present(stored.find((each) => each.name === name)),
    days: async () =>
      (await fixture.reader.read(tripId)).itinerary.days.map((day) => day.id),
  };
}

export async function withEnds(
  trip: Awaited<ReturnType<typeof newMoabTrip>>,
): Promise<void> {
  await trip.updateItinerary({
    startPlace: { placeId: trip.place("Grand Junction").id, name: "GJ" },
    endPlace: { placeId: trip.place("Salt Lake City").id, name: "SLC" },
    startDate: "2027-10-10",
  });
}

// The Moab example as planned (domain model 5.2), with its stops, stored for the tools.
export async function plannedMoab(): Promise<
  Tools & {
    example: ReturnType<typeof moabExample>;
    fixture: ReturnType<typeof setUp>;
  }
> {
  const fixture = setUp();
  const example = moabExample();
  await storeTrip(fixture, example.trip);
  return {
    ...toolsFor({ ...fixture, tripId: example.trip.id }),
    example,
    fixture,
  };
}
