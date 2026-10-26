import { Calendar } from "../domain/calendar.js";
import { placeText } from "../domain/check-text.js";
import { RuleError } from "../domain/rule-error.js";
import { FIND_IN_TRIP_INPUT } from "./find-in-trip-input.schema.js";
import { closestByName, hasNameToMatch } from "./name-match.js";
import { FIND_PLACE_MATCHES } from "./place-tools.js";
import { placeLine } from "./stop-lines.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";
import { type PlaceInTrip, placesInTrip } from "./trip-places.js";
import type { TripSession } from "./trip-session.js";

// The tool that finds a place the user names among the trip's own places (tool design
// 2.1). A whole read lists no candidate names, so without it the coordinator would guess
// which stop or stay holds the place.

export const FIND_IN_TRIP_DESCRIPTION = `Searches this trip's own places by name, to find where a place the user names sits in the trip. It searches only the places the itinerary holds: every stop's and stay's candidates, the places the user rejected, the start and end places, and the stays' towns. It doesn't search Google, and a place a search found that was never added to the itinerary isn't in it. Returns the ${String(FIND_PLACE_MATCHES)} places whose names are closest to the text, best first, or every place when the trip has fewer. Each comes with its place ID and short line of facts, and a line for each spot the trip holds it in, such as a stop or stay it's a candidate for, with its set and whether it's selected. A typo or part of a name still finds the place. It always returns the closest few, even when none of them is the place the user meant. So check the names before using an ID.`;

export function findInTripTool(session: TripSession): StrictToolDefinition {
  return {
    ...strictTool(
      "find_in_trip",
      FIND_IN_TRIP_DESCRIPTION,
      FIND_IN_TRIP_INPUT,
      ({ text }) =>
        readReplyOrReadableError(async () => {
          if (!hasNameToMatch(text)) {
            throw new RuleError(
              `The text has no letters or digits to match. It was given "${text}".`,
            );
          }
          const trip = await session.reader.read(session.tripId);
          const calendar = new Calendar({
            tripBrief: trip.tripBrief,
            settings: session.settings,
            now: session.now,
          });
          const places = placesInTrip({ itinerary: trip.itinerary, calendar });
          return textReply(replyLines(text, places));
        }),
    ),
    annotations: { readOnlyHint: true },
  };
}

// The closest places, each with its short line and a line for each spot, in the read's
// style. A trip with no places yet isn't an error.
function replyLines(text: string, places: readonly PlaceInTrip[]): string[] {
  if (places.length === 0) {
    return [`The trip has no places yet, so "${text}" isn't in it.`];
  }
  const closest = closestByName(
    text,
    places,
    ({ place }) => placeText(place),
    FIND_PLACE_MATCHES,
  );
  const heading =
    closest.length === 1
      ? `The 1 place in the trip closest to "${text}":`
      : `The ${String(closest.length)} places in the trip closest to "${text}", best first:`;
  return [
    heading,
    ...closest.flatMap(({ place, spotLines }) => [
      `- ${placeLine(place)}.`,
      ...spotLines.map((line) => `  - ${line}`),
    ]),
  ];
}
