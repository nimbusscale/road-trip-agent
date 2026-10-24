import { CalendarDate } from "../domain/calendar-date.js";
import type { Place } from "../domain/place.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { refuseWrongKind } from "./id-kind.js";
import { itineraryWriteReply, refuseNoChange } from "./itinerary-write.js";
import {
  UPDATE_ITINERARY_INPUT,
  type UpdateItineraryInput,
} from "./skeleton-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import type { TripSession } from "./trip-session.js";

// The tool that changes the itinerary's own properties (tool design 2.1).

export const UPDATE_ITINERARY_DESCRIPTION =
  "Changes the itinerary's start place, end place, or start date. Items not given are not changed. For a loop, give the same place as the start and the end. The start date has to be after today at the start place, so it needs a start place, which the same call can set. A place keeps the name Google has for it. The name given is used only for a place Google has no name for, such as a street address, and only the first name given is kept. The reply says when the name given wasn't used.";

export function updateItineraryTool(
  session: TripSession,
): StrictToolDefinition {
  return strictTool(
    "update_itinerary",
    UPDATE_ITINERARY_DESCRIPTION,
    UPDATE_ITINERARY_INPUT,
    (input) =>
      itineraryWriteReply(session, (context) => ({
        lines: ["Changed the itinerary.", ...applyChanges(input, context)],
        touchedIds: [],
      })),
  );
}

// The start place goes before the start date, since the date needs it. Returns a line
// for each name that wasn't used.
function applyChanges(
  input: UpdateItineraryInput,
  { trip, services, placeOf }: ChangeContext,
): string[] {
  const { startPlace, endPlace, startDate } = input;
  refuseNoChange(
    [startPlace, endPlace, startDate],
    "Give a start place, an end place, or a start date.",
  );
  const itinerary = trip.itinerary;
  const lines: string[] = [];
  if (startPlace !== undefined) {
    const place = namedPlaceOf(placeOf, startPlace, lines);
    services.itinerary.setStartPlace(itinerary, place);
  }
  if (endPlace !== undefined) {
    itinerary.endPlace = namedPlaceOf(placeOf, endPlace, lines);
  }
  if (startDate !== undefined) {
    services.itinerary.setStartDate(
      itinerary,
      CalendarDate.fromText(startDate),
    );
  }
  return lines;
}

// A place can't be renamed in the MVP, so a name given for a place that has one is
// only reported (domain model 3.10).
export function namedPlaceOf(
  placeOf: ChangeContext["placeOf"],
  given: { placeId: string; name: string },
  lines: string[],
): Place {
  refuseWrongKind(given.placeId, "place");
  const place = placeOf(given.placeId);
  place.fillName(given.name);
  if (place.name !== given.name) {
    lines.push(
      `Kept the name ${place.name ?? ""} for ${place.id}, not "${given.name}", since a place's name can't change.`,
    );
  }
  return place;
}
