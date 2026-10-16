import tzLookup from "@photostructure/tz-lookup";

import { CalendarDate } from "./calendar-date.js";
import type { Place } from "./place.js";

// Today's date at a place: in the time zone its coordinates fall in (domain model 3.1).
// The time zone comes from a lookup table in the library, with no outside call
// (persistence design, section 5). The calendar's today() uses it with the start place
// (phase 17).
export function todayAt(place: Place, now: Date): CalendarDate {
  const timeZone = tzLookup(place.latitude, place.longitude);
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

// A trip has started once today, at its start place, is on or after its start date. It
// hasn't while it has no start date (domain model 3.1). The itinerary refuses a start
// date until it has a start place, so a start date always comes with one.
export function hasStartedOn(
  startDate: CalendarDate | null,
  startPlace: Place | null,
  now: Date,
): boolean {
  if (startDate === null || startPlace === null) {
    return false;
  }
  return todayAt(startPlace, now).compareTo(startDate) >= 0;
}
