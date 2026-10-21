import { RuleError } from "../domain/rule-error.js";
import { ID_PREFIXES, type IdKind } from "../ids/new-id.js";

// Each kind of ID, as an error names it.
const KIND_NAMES: Record<IdKind, string> = {
  trip: "trip",
  tripBrief: "trip brief",
  itinerary: "itinerary",
  session: "session",
  stay: "stay",
  day: "day",
  stop: "stop",
  place: "place",
  memoryItem: "memory item",
};

const KINDS: readonly IdKind[] = [
  "trip",
  "tripBrief",
  "itinerary",
  "session",
  "stay",
  "day",
  "stop",
  "place",
  "memoryItem",
];

// An ID of the wrong kind gets an error that says so, such as a stop ID given for a stay
// (tool design, section 4). Any other unknown ID is left to the lookup, which says the
// trip has no such item.
export function refuseWrongKind(id: string, expected: IdKind): void {
  const given = KINDS.find((kind) => id.startsWith(ID_PREFIXES[kind]));
  if (given !== undefined && given !== expected) {
    throw new RuleError(
      `${id} is a ${KIND_NAMES[given]} ID, not a ${KIND_NAMES[expected]} ID.`,
    );
  }
}
