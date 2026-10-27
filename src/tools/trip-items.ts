import type { Day } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";
import { ID_PREFIXES, type IdKind } from "../ids/new-id.js";
import { refuseWrongKind } from "./id-kind.js";

// Finds the item a tool input names by ID. A bad ID gets an error, and the tool never
// guesses (tool design, section 4).

// The word a tool takes in place of an item to go after (tool design 2.1, "Where an
// item goes").
export const FIRST = "first";

export function stayIn(itinerary: Itinerary, id: string): Stay {
  return found(itinerary.stays, id, "stay");
}

export function dayIn(itinerary: Itinerary, id: string): Day {
  return found(itinerary.days, id, "day");
}

export function stopIn(itinerary: Itinerary, id: string): Stop {
  return found(stopsOf(itinerary), id, "stop");
}

// The stay to go after, or null for "first".
export function stayAfter(itinerary: Itinerary, after: string): Stay | null {
  return after === FIRST ? null : stayIn(itinerary, after);
}

// The stop to go after, or null for "first". Whether it's on the day the call names is
// the day's own rule.
export function stopAfter(itinerary: Itinerary, after: string): Stop | null {
  return after === FIRST ? null : stopIn(itinerary, after);
}

// A tool that takes a stop or a stay, such as select_candidate.
export type StopOrStay =
  | { readonly kind: "stop"; readonly stop: Stop }
  | { readonly kind: "stay"; readonly stay: Stay };

export function stopOrStayIn(itinerary: Itinerary, id: string): StopOrStay {
  if (id.startsWith(ID_PREFIXES.stay)) {
    return { kind: "stay", stay: stayIn(itinerary, id) };
  }
  if (id.startsWith(ID_PREFIXES.stop)) {
    return { kind: "stop", stop: stopIn(itinerary, id) };
  }
  throw new RuleError(`${id} isn't a stop or stay ID.`);
}

export function stopsOf(itinerary: Itinerary): Stop[] {
  return itinerary.days.flatMap((day) => day.stops);
}

function found<T extends { id: string }>(
  items: readonly T[],
  id: string,
  kind: IdKind,
): T {
  refuseWrongKind(id, kind);
  const item = items.find((each) => each.id === id);
  if (item === undefined) {
    throw new RuleError(`This trip has no ${kind} ${id}.`);
  }
  return item;
}
