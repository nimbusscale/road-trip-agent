import { Calendar } from "../domain/calendar.js";
import type { CalendarDate } from "../domain/calendar-date.js";
import { placeText } from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stop } from "../domain/stop.js";
import type { Trip } from "../domain/trip.js";
import { ID_PREFIXES } from "../ids/new-id.js";
import { SEARCH_NEAR_INPUT } from "./place-search-input.schema.js";
import type { PlacesSession } from "./places-session.js";
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
import { stayIn, stopIn } from "./trip-items.js";

// The search for places near a stop or stay (tool design, section 2.3).

// Enough to choose from, without filling the worker's context: each result is several
// lines, with its summaries.
export const SEARCH_NEAR_RESULTS = 10;

const METERS_PER_MILE = 1609.344;

const PAST_MIDNIGHT_NOTE =
  "Google lists hours that run past midnight on the day they open.";

export function searchNearDescription(
  nearDistanceMiles: number,
  cutoffMiles: number,
): string {
  return `Searches Google for places near one of your stops or stays, such as hotels for a stay, or restaurants for a meal near it. It searches around the stay's selected lodging, or its town while none is selected. For a stop near the trip's start or end place, it searches around that place. It favors places within ${String(nearDistanceMiles)} miles, and a query that names somewhere farther, such as "restaurants in Tuolumne Meadows", searches there. Places more than ${String(cutoffMiles)} miles away in a straight line are left out. A query about a style alone, such as "Victorian house", can find little nearby, since Google matches it anywhere. Then naming the area in the query, such as "Victorian house inn Portland Maine", can help. Returns up to ${String(SEARCH_NEAR_RESULTS)} places, best match first, each with its place ID, type, address, distance in a straight line, rating and review count, price level, links, and what Google and the public say about it. Each place's opening hours are given for the stop's date, or for each of the stay's dates. For a stop after midnight, they're given for the day before too, since Google lists hours that run past midnight on the day they open, such as Friday's "11:00 AM – 2:00 AM". They're Google's hours for a normal week, with no holidays or seasonal closures. Places the user rejected for this trip are left out. Every place found is saved to the trip, so its place ID works in the other tools.`;
}

export function searchNearTool(session: PlacesSession): StrictToolDefinition {
  return strictTool(
    "search_near",
    searchNearDescription(
      session.settings.nearDistanceMiles,
      session.settings.nearCutoffDistanceMiles,
    ),
    SEARCH_NEAR_INPUT,
    ({ stopOrStayId, query }) =>
      readReplyOrReadableError(() => searchNear(session, stopOrStayId, query)),
  );
}

async function searchNear(
  session: PlacesSession,
  stopOrStayId: string,
  query: string,
): Promise<ToolReply> {
  const trip = await session.reader.read(session.tripId);
  const { point, dates, afterMidnight } = searchPointOf(
    calendarFor(trip, session),
    trip.itinerary,
    stopOrStayId,
  );
  const found = await session.google.searchNear(
    query,
    {
      latitude: point.latitude,
      longitude: point.longitude,
      radiusInMeters: session.settings.nearDistanceMiles * METERS_PER_MILE,
    },
    SEARCH_NEAR_RESULTS,
  );
  const around = `around ${placeText(point)} (${point.id})`;
  const { near, tooFar } = withinCutoff(
    found,
    point,
    session.settings.nearCutoffDistanceMiles,
  );
  if (near.length === 0) {
    return textReply([
      `Google found no places for "${query}" ${around}.`,
      ...leftOutLines([tooFar]),
    ]);
  }
  // A place the trip already has comes back as first stored, with its ID.
  const saved = await session.placeWriter.save(session.tripId, near);
  const rejected = rejectedIds(trip.itinerary.rejectedPlaces);
  const kept = saved.filter((place) => !rejected.has(place.id));
  return textReply([
    `Places for "${query}" ${around}, best match first. ${hoursForLine(dates)}${afterMidnight && dates.length > 0 ? ` ${PAST_MIDNIGHT_NOTE}` : ""}`,
    ...kept.flatMap((place) =>
      resultLines(
        place,
        `${milesText(milesBetween(point, place))} away.`,
        dates,
      ),
    ),
    ...leftOutLines([
      [saved.length - kept.length, "the user rejected for this trip"],
      tooFar,
    ]),
  ]);
}

interface WithinCutoff {
  near: Place[];
  // How many places were dropped, and why.
  tooFar: [count: number, why: string];
}

// The bias lets a query about a style alone find places across the country, which a
// search near a stay never needs. They're dropped before they're saved, as the crow
// flies from the point (tool design 2.3).
function withinCutoff(
  found: readonly Place[],
  point: Place,
  cutoffMiles: number,
): WithinCutoff {
  const near = found.filter(
    (place) => milesBetween(point, place) <= cutoffMiles,
  );
  return {
    near,
    tooFar: [
      found.length - near.length,
      `more than ${String(cutoffMiles)} miles away`,
    ],
  };
}

// The searches need only the calendar's lookups, such as a day's date.
export function calendarFor(trip: Trip, session: PlacesSession): Calendar {
  return new Calendar({
    tripBrief: trip.tripBrief,
    settings: session.settings,
    now: session.now,
  });
}

interface SearchPoint {
  point: Place;
  // The dates the hours are given for. Empty while the trip has no start date.
  dates: CalendarDate[];
  // A stop set after midnight, whose hours start the day before.
  afterMidnight: boolean;
}

// A stay searches around where the party sleeps: its lodging, or its town while none is
// selected (tool design 2.3).
function searchPointOf(
  calendar: Calendar,
  itinerary: Itinerary,
  id: string,
): SearchPoint {
  if (id.startsWith(ID_PREFIXES.stay)) {
    const stay = stayIn(itinerary, id);
    return {
      point: stay.sleepsAt,
      dates: calendar.datesOf(itinerary, stay),
      afterMidnight: false,
    };
  }
  if (!id.startsWith(ID_PREFIXES.stop)) {
    throw new RuleError(`${id} isn't a stop ID or a stay ID.`);
  }
  const stop = stopIn(itinerary, id);
  const day = calendar.dayOf(itinerary, stop);
  return {
    point: stopPoint(itinerary, stop, day),
    dates: stopDates(calendar, itinerary, stop, day),
    afterMidnight: stop.setTime?.isNextDay === true,
  };
}

function stopPoint(itinerary: Itinerary, stop: Stop, day: Day): Place {
  switch (stop.searchArea) {
    case "nearStay":
      // A stop near a stay always has its stay (domain model 3.7).
      if (stop.searchAreaStay === null) {
        throw new Error(`Stop ${stop.id} is near a stay, but has none.`);
      }
      return stop.searchAreaStay.sleepsAt;
    case "nearStartPlace":
      return endPlace(itinerary.startPlace, "start");
    case "nearEndPlace":
      return endPlace(itinerary.endPlace, "end");
    case "alongLeg":
      throw new RuleError(
        `${stop.id} is along the leg, so it has no place to search near. Search along its day's drive with search_along_leg and the day ID ${day.id}.`,
      );
    case null:
      throw new RuleError(
        `${stop.id} is a check-in, so it has no candidates to search for. Its place is where the party sleeps that night.`,
      );
  }
}

function endPlace(place: Place | null, end: "start" | "end"): Place {
  if (place === null) {
    throw new RuleError(`The trip has no ${end} place yet.`);
  }
  return place;
}

// The date the stop falls on. For a set time after midnight, that's the next day, with
// the day before too, since Google lists hours that run past midnight on the day they
// open (tool design 2.3).
function stopDates(
  calendar: Calendar,
  itinerary: Itinerary,
  stop: Stop,
  day: Day,
): CalendarDate[] {
  const date = calendar.dateOf(itinerary, day);
  if (date === null) {
    return [];
  }
  return stop.setTime?.isNextDay === true ? [date, date.plusDays(1)] : [date];
}
