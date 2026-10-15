import { randomInt } from "node:crypto";

// The prefix for each kind of item (technical spec 7.1). A user's ID is Supabase's
// UUID, so it has none.
export const ID_PREFIXES = {
  trip: "trip_",
  tripBrief: "brief_",
  itinerary: "itin_",
  session: "session_",
  stay: "stay_",
  day: "day_",
  stop: "stop_",
  place: "place_",
  memoryItem: "mem_",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

// Lowercase letters and digits, leaving out 0, 1, i, l, and o, which are easy to confuse
// when copied. 31 characters, 8 at a time: about 850 billion IDs.
export const ID_CHARACTERS = "abcdefghjkmnpqrstuvwxyz23456789";
export const ID_RANDOM_LENGTH = 8;

// Random, not counted, so an ID an agent makes up doesn't land on a real item.
export function newId(kind: IdKind): string {
  let random = "";
  for (let index = 0; index < ID_RANDOM_LENGTH; index++) {
    random += ID_CHARACTERS.charAt(randomInt(ID_CHARACTERS.length));
  }
  return ID_PREFIXES[kind] + random;
}
