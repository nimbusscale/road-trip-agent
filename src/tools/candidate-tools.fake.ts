import { placeNamed } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import {
  addAttractionCandidatesTool,
  addLodgingCandidatesTool,
  addMealCandidatesTool,
} from "./candidate-tools.js";
import { plannedMoab } from "./skeleton-tools.fake.js";
import type { StrictToolDefinition } from "./strict-tool.js";
import type { ToolReply } from "./tool-reply.js";
import type { TripSession } from "./trip-session.js";

// add_lodging_candidates, add_meal_candidates, and add_attraction_candidates over the
// Moab example as planned (domain model 5.2), in the fake store, for the candidate tool
// tests. Each stop and stay there already has a set: the place selected for it. The
// fake route finder gives each segment 30 minutes.

export const GOOGLE_LINK = "https://maps.google.com/?cid=1";

export async function moabWithPlaces(names: readonly string[]) {
  const planned = await plannedMoab();
  const tripId = planned.example.trip.id;
  const stored = await planned.fixture.store.places.addPlaces(
    tripId,
    names.map((name) => placeNamed(name)),
  );
  const session: TripSession = { ...planned.fixture, tripId };
  const call =
    (make: (session: TripSession) => StrictToolDefinition) =>
    (input: unknown): Promise<ToolReply> => {
      const tool = make(session);
      // The Agent SDK checks the input against the schema before the handler runs.
      return tool.handler(tool.inputSchema.parse(input));
    };
  return {
    ...planned,
    tripId,
    placeId: (name: string) =>
      present(stored.find((each) => each.name === name)).id,
    addLodging: call(addLodgingCandidatesTool),
    addMeal: call(addMealCandidatesTool),
    addAttraction: call(addAttractionCandidatesTool),
  };
}

// A candidate found on Google, with no notes.
export function found(placeId: string, rationale = "Fits the trip.") {
  return {
    placeId,
    name: "a name Google already has",
    rationale,
    howFound: "google",
    sourceLink: GOOGLE_LINK,
    notes: "",
  };
}
