import tzLookup from "@photostructure/tz-lookup";

import { CalendarDate } from "./calendar-date.js";
import type { Place } from "./place.js";

// Today's date at a place: in the time zone its coordinates fall in (domain model 3.1).
// The time zone comes from a lookup table in the library, with no outside call
// (persistence design, section 5). The calendar's today() uses it with the start place.
export function todayAt(place: Place, now: Date): CalendarDate {
  return todayIn(timeZoneAt(place), now);
}

// The time zone of a trip's today: at its start place, since that is where the trip
// begins, and UTC until it has one (technical spec 5.2). The coordinator is given the
// date in it, and Claude Code's own date line uses it too, so the two agree.
export function tripTimeZone(startPlace: Place | null): string {
  return startPlace === null ? "UTC" : timeZoneAt(startPlace);
}

// Today's date for a trip, in tripTimeZone(). The calendar's today() is null until
// there's a start place instead, since no rule uses today's date before then.
export function tripToday(startPlace: Place | null, now: Date): CalendarDate {
  return todayIn(tripTimeZone(startPlace), now);
}

function timeZoneAt(place: Place): string {
  return tzLookup(place.latitude, place.longitude);
}

function todayIn(timeZone: string, now: Date): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((each) => each.type === type)?.value);
  return new CalendarDate(part("year"), part("month"), part("day"));
}

// Today's date at the start place, once the trip has started: once today is on or
// after its start date. Null while it hasn't, and while it has no start date (domain
// model 3.1). The error for a started trip gives this date, so it matches the date the
// coordinator was given (technical spec section 8). The itinerary refuses a start date
// until it has a start place, so a start date always comes with one.
export function startedToday(
  startDate: CalendarDate | null,
  startPlace: Place | null,
  now: Date,
): CalendarDate | null {
  if (startDate === null || startPlace === null) {
    return null;
  }
  const today = todayAt(startPlace, now);
  return today.compareTo(startDate) >= 0 ? today : null;
}

export function hasStartedOn(
  startDate: CalendarDate | null,
  startPlace: Place | null,
  now: Date,
): boolean {
  return startedToday(startDate, startPlace, now) !== null;
}
