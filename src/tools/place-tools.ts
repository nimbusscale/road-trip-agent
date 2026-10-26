import { placeText } from "../domain/check-text.js";
import type { Place } from "../domain/place.js";
import { labeledAsPlaceContent } from "../google/place-content.js";
import { refuseWrongKind } from "./id-kind.js";
import { FIND_PLACE_INPUT, READ_PLACE_INPUT } from "./place-input.schema.js";
import type { PlacesSession } from "./places-session.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";

// The tools that find a place and read it (tool design, section 2.3).

// "The best few matches" (tool design 2.3): enough to tell the right place from others
// with the same name, without filling the context.
export const FIND_PLACE_MATCHES = 5;

export const FIND_PLACE_DESCRIPTION = `Finds a named place on Google: a town, a sight, a restaurant, a hotel, or a street address. Returns up to ${String(FIND_PLACE_MATCHES)} matches, best first, each with its place ID, name, type, and address. Check the address to tell whether a match is the right place. A street address has no name or type on Google. A place the user rejected for this trip is marked rejected, with the user's reason. Every match is stored, so its place ID works in the other tools. That doesn't add it to the itinerary.`;

export const READ_PLACE_DESCRIPTION =
  "Reads everything stored about one of the trip's places: its type, address, coordinates, rating and review count, price level, weekly opening hours, links, and what Google and the public say about it. The hours are Google's for a normal week, with no holidays or seasonal closures.";

export function findPlaceTool(session: PlacesSession): StrictToolDefinition {
  return strictTool(
    "find_place",
    FIND_PLACE_DESCRIPTION,
    FIND_PLACE_INPUT,
    ({ text, where }) =>
      readReplyOrReadableError(async () => {
        // Where to search goes into the text, so a lookup doesn't match places
        // anywhere (tool design 2.3).
        const query = `${text}, ${where}`;
        const found = await session.google.searchText(
          query,
          FIND_PLACE_MATCHES,
        );
        if (found.length === 0) {
          return textReply([`Google found no place for "${query}".`]);
        }
        // A place the trip already has comes back as first stored, with its ID.
        const [places, trip] = await Promise.all([
          session.placeWriter.save(session.tripId, found),
          session.reader.read(session.tripId),
        ]);
        const rejected = new Map(
          trip.itinerary.rejectedPlaces.map((each) => [
            each.place.id,
            each.reason,
          ]),
        );
        return textReply([
          `Matches for "${query}", best first:`,
          ...places.map((place) => matchLine(place, rejected.get(place.id))),
        ]);
      }),
  );
}

export function readPlaceTool(session: PlacesSession): StrictToolDefinition {
  return {
    ...strictTool(
      "read_place",
      READ_PLACE_DESCRIPTION,
      READ_PLACE_INPUT,
      ({ placeId }) =>
        readReplyOrReadableError(async () => {
          refuseWrongKind(placeId, "place");
          // Refuses a place from another trip like one that doesn't exist.
          const place = await session.places.get(session.tripId, placeId);
          return textReply(recordLines(place));
        }),
    ),
    annotations: { readOnlyHint: true },
  };
}

// Such as "- Milt's Stop & Eat (place_…). Type: Hamburger restaurant. Address: …".
function matchLine(place: Place, rejectedReason: string | undefined): string {
  const name = place.name ?? "No name on Google";
  const rejected =
    rejectedReason === undefined
      ? ""
      : ` Rejected by the user for this trip: "${rejectedReason}".`;
  return `- ${name} (${place.id}). Type: ${place.type ?? "none"}. Address: ${place.address}.${rejected}`;
}

// The full record (technical spec 7.2). The summaries come from what the public wrote,
// so they go inside the place content label (Google design 2.3).
function recordLines(place: Place): string[] {
  return [
    `${placeText(place)} (${place.id})`,
    ...(place.name === null ? ["No name on Google."] : []),
    `Type: ${place.type ?? "none"}`,
    `Address: ${place.address}`,
    `Coordinates: ${String(place.latitude)}, ${String(place.longitude)}`,
    `Rating: ${ratingText(place)}`,
    `Price level: ${place.priceLevel ?? "not listed"}`,
    ...listLines("Opening hours", place.weekdayHoursLines, "not known"),
    ...listLines("Links", place.links, "none"),
    place.summaries.length === 0
      ? "Summaries: none"
      : labeledAsPlaceContent(place.summaries),
  ];
}

function ratingText(place: Place): string {
  if (place.rating === null) {
    return "none";
  }
  const reviews =
    place.reviewCount === null
      ? ""
      : ` from ${place.reviewCount.toLocaleString("en-US")} reviews`;
  return `${place.rating.toFixed(1)} stars${reviews}`;
}

function listLines(
  label: string,
  items: readonly string[],
  whenEmpty: string,
): string[] {
  return items.length === 0
    ? [`${label}: ${whenEmpty}`]
    : [`${label}:`, ...items.map((item) => `- ${item}`)];
}
