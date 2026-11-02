import { MEMORY_SERVER_NAME } from "../tools/memory-server.js";
import { PLACES_SERVER_NAME } from "../tools/places-server.js";
import { TRIP_SERVER_NAME } from "../tools/trip-server.js";

// What the rebuild does with each recorded call (#244).
// - checkpoint: a read that shows the trip. It runs again on the rebuilt trip, and the
//   two replies are compared.
// - placeSave: a search that saved places. The places its reply names are copied from
//   the live trip's place rows, not looked up at Google again.
// - replay: a call that changes the trip or memory. It runs again through today's tool.
// - skip: changes nothing the rebuild keeps, such as a route or a web search.
export type CallKind = "checkpoint" | "placeSave" | "replay" | "skip";

const CHECKPOINTS = new Set([
  `mcp__${TRIP_SERVER_NAME}__read_trip_brief`,
  `mcp__${TRIP_SERVER_NAME}__read_itinerary`,
  `mcp__${TRIP_SERVER_NAME}__read_worker_brief_facts`,
  `mcp__${MEMORY_SERVER_NAME}__read_memory`,
]);

const PLACE_SAVES = new Set([
  `mcp__${PLACES_SERVER_NAME}__find_place`,
  `mcp__${PLACES_SERVER_NAME}__search_near`,
  `mcp__${PLACES_SERVER_NAME}__search_along_leg`,
]);

// Reads that show too little of the trip to be worth comparing.
const SKIPPED_READS = new Set([`mcp__${TRIP_SERVER_NAME}__find_in_trip`]);

export function callKindOf(name: string): CallKind {
  if (CHECKPOINTS.has(name)) {
    return "checkpoint";
  }
  if (PLACE_SAVES.has(name)) {
    return "placeSave";
  }
  const changes =
    name.startsWith(`mcp__${TRIP_SERVER_NAME}__`) ||
    name.startsWith(`mcp__${MEMORY_SERVER_NAME}__`);
  return changes && !SKIPPED_READS.has(name) ? "replay" : "skip";
}
