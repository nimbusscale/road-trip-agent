import type { Calendar } from "../domain/calendar.js";
import { durationText, placeText } from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Leg } from "../domain/leg.js";
import type { Place } from "../domain/place.js";
import { RuleError } from "../domain/rule-error.js";
import type { RouteSummary } from "../google/places-text-search.schema.js";
import { SEARCH_ALONG_LEG_INPUT } from "./place-search-input.schema.js";
import type { PlacesSession } from "./places-session.js";
import { calendarFor } from "./search-near-tool.js";
import { LegPosition } from "./leg-position.js";
import {
  hoursForLine,
  leftOutLines,
  milesBetween,
  milesText,
  rejectedIds,
  resultLines,
} from "./search-result-lines.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import {
  readReplyOrReadableError,
  textReply,
  type ToolReply,
} from "./tool-reply.js";
import { dayIn } from "./trip-items.js";

// The search for places along a day's drive (tool design, section 2.3).

// Google's most. Some are dropped near the drive's ends, and the rest cover the whole
// drive, so a long drive needs them all.
export const SEARCH_ALONG_LEG_RESULTS = 20;

export function searchAlongLegDescription(endDistanceMiles: number): string {
  return `Searches Google for places along one day's drive, such as viewpoints, or lunch on the way. Returns up to ${String(SEARCH_ALONG_LEG_RESULTS)} places, in the order the drive reaches them, each with its place ID, type, address, about how far into the drive it is, a rough detour time, rating and review count, price level, links, and what Google and the public say about it. How far into the drive is worked out from where the place is along the day's route, so it's rough too. Each place's opening hours are given for the day's date. They're Google's hours for a normal week, with no holidays or seasonal closures. Places within ${String(endDistanceMiles)} miles of either end of the drive are left out, since results bunch up there. Near a big city, results can still bunch up at the ends, so name a town in the middle of the drive in the query. The detour time is the extra driving to stop there. Google works it out from its fastest drives to and from the place, which don't follow the day's waypoints or stops, so it can be far off. Google can miss well-known places, so try more than one query, such as "tourist attraction" and "scenic viewpoint". Places the user rejected for this trip are left out. Every place found is saved to the trip, so its place ID works in the other tools.`;
}

export function searchAlongLegTool(
  session: PlacesSession,
): StrictToolDefinition {
  return strictTool(
    "search_along_leg",
    searchAlongLegDescription(session.settings.alongLegEndDistanceMiles),
    SEARCH_ALONG_LEG_INPUT,
    ({ dayId, query }) =>
      readReplyOrReadableError(() => searchAlongLeg(session, dayId, query)),
  );
}

// A place found along the leg, with Google's drives to and from it, or null when
// Google gave none. Only the detour time comes from them.
interface Found {
  place: Place;
  route: RouteSummary | null;
}

async function searchAlongLeg(
  session: PlacesSession,
  dayId: string,
  query: string,
): Promise<ToolReply> {
  const trip = await session.reader.read(session.tripId);
  const calendar = calendarFor(trip, session);
  const itinerary = trip.itinerary;
  const day = dayIn(itinerary, dayId);
  const dayName = `Day ${String(calendar.orderOf(itinerary, day) + 1)}`;
  const leg = legOf(calendar, itinerary, day, dayName);
  // The route line never passes through the worker's context (tool design 2.3).
  const found = await session.google.searchAlongRoute(
    query,
    {
      routeLine: leg.routeLine,
      start: {
        latitude: leg.routedFromPlace.latitude,
        longitude: leg.routedFromPlace.longitude,
      },
    },
    SEARCH_ALONG_LEG_RESULTS,
  );
  const drive = `along ${dayName}'s drive (${day.id}), from ${placeText(leg.routedFromPlace)} to ${placeText(leg.routedToPlace)}`;
  if (found.length === 0) {
    return textReply([`Google found no places for "${query}" ${drive}.`]);
  }
  // A place the trip already has comes back as first stored, with its ID.
  const saved = await session.placeWriter.save(
    session.tripId,
    found.map((each) => each.place),
  );
  const date = calendar.dateOf(itinerary, day);
  const dates = date === null ? [] : [date];
  const sorted = sortedAlongLeg(
    saved.map((place, index) => ({
      place,
      route: found[index]?.route ?? null,
    })),
    { session, itinerary, leg },
  );
  return textReply([
    `Places for "${query}" ${drive}, in the order the drive reaches them. ${hoursForLine(dates)}`,
    ...sorted.kept.flatMap((onLeg) =>
      resultLines(onLeg.place, whereOnLeg(onLeg, leg), dates),
    ),
    ...leftOutLines(sorted.leftOut),
  ]);
}

// Refuses a day with nothing along a leg, as add_stops does (tool design 2.1).
function legOf(
  calendar: Calendar,
  itinerary: Itinerary,
  day: Day,
  dayName: string,
): Leg {
  if (calendar.isStayingPut(itinerary, day)) {
    throw new RuleError(
      `${dayName} (${day.id}) starts and ends at the same stay, so nothing on it is along a leg. Search near the stay with search_near.`,
    );
  }
  if (day.leg === null) {
    throw new RuleError(
      `${dayName} (${day.id}) has no route yet, since the trip's start place or end place isn't set.`,
    );
  }
  return day.leg;
}

// A place kept, with the share of the leg's drive before it.
interface OnLeg extends Found {
  share: number;
}

interface Sorted {
  kept: OnLeg[];
  leftOut: [count: number, why: string][];
}

// Drops the trip's rejected places, and places within the end distance of either end,
// as the crow flies. The rest are sorted by where they are along the leg's route line
// (Google design 2.3).
function sortedAlongLeg(
  found: readonly Found[],
  given: { session: PlacesSession; itinerary: Itinerary; leg: Leg },
): Sorted {
  const { leg } = given;
  const endMiles = given.session.settings.alongLegEndDistanceMiles;
  const rejected = rejectedIds(given.itinerary.rejectedPlaces);
  const notRejected = found.filter((each) => !rejected.has(each.place.id));
  const position = new LegPosition(leg.routeLine);
  const kept = notRejected
    .filter(
      ({ place }) =>
        milesBetween(leg.routedFromPlace, place) > endMiles &&
        milesBetween(leg.routedToPlace, place) > endMiles,
    )
    .map((each) => ({ ...each, share: position.shareBefore(each.place) }))
    .sort((first, second) => first.share - second.share);
  return {
    kept,
    leftOut: [
      [found.length - notRejected.length, "the user rejected for this trip"],
      [
        notRejected.length - kept.length,
        `within ${String(endMiles)} miles of either end of the drive`,
      ],
    ],
  };
}

// Such as "About 21 m and 8.1 miles into the drive. Detour: about 5 m." How far into
// the drive is the leg's drive time and distance times the share of its route line
// before the place.
function whereOnLeg(onLeg: OnLeg, leg: Leg): string {
  const minutes = Math.round(leg.driveTimeInMinutes * onLeg.share);
  const miles = leg.distanceInMiles * onLeg.share;
  return `About ${durationText(minutes)} and ${milesText(miles)} into the drive. Detour: ${detourText(onLeg.route, leg)}.`;
}

// Google's drives to and from the place, less the leg's own drive time, and never less
// than 0 (Google design 2.3).
function detourText(route: RouteSummary | null, leg: Leg): string {
  if (route === null) {
    return "not known";
  }
  const detour =
    route.fromStart.driveTimeInMinutes +
    route.toEnd.driveTimeInMinutes -
    leg.driveTimeInMinutes;
  return `about ${durationText(Math.max(0, detour))}`;
}
