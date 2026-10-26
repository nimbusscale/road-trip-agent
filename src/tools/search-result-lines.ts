import type { CalendarDate } from "../domain/calendar-date.js";
import type { Place } from "../domain/place.js";
import type { RejectedPlace } from "../domain/rejected-place.js";
import { labeledAsPlaceContent } from "../google/place-content.js";
import { ratingText } from "./place-tools.js";

// How the place searches show each place they found (tool design 2.3): what a worker
// needs to choose, with the hours for the dates it plans for, not the whole week.

const EARTH_RADIUS_IN_MILES = 3958.8;

// One place's lines, after a blank line. `where` says where the place is from the
// search's point or along the leg, such as "3.2 miles away".
export function resultLines(
  place: Place,
  where: string,
  dates: readonly CalendarDate[],
): string[] {
  return [
    "",
    `${place.name ?? "No name on Google"} (${place.id})`,
    `Type: ${place.type ?? "none"}. Address: ${place.address}. ${where}`,
    `Rating: ${ratingText(place)}. Price level: ${place.priceLevel ?? "not listed"}.`,
    ...(dates.length === 0 ? [] : [`Hours: ${hoursOn(place, dates)}`]),
    `Links: ${place.links.length === 0 ? "none" : place.links.join(" ")}`,
    place.summaries.length === 0
      ? "Summaries: none"
      : labeledAsPlaceContent(place.summaries),
  ];
}

// Such as "Hours are for Sunday, October 10, 2027 to Wednesday, October 13, 2027.",
// or why there are none.
export function hoursForLine(dates: readonly CalendarDate[]): string {
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) {
    return "The trip has no start date yet, so no hours are given.";
  }
  return first.equals(last)
    ? `Hours are for ${first.longText}.`
    : `Hours are for ${first.longText} to ${last.longText}.`;
}

// The trip's rejected places, by ID, which the searches leave out (tool design 2.3).
export function rejectedIds(
  rejected: readonly RejectedPlace[],
): ReadonlySet<string> {
  return new Set(rejected.map((each) => each.place.id));
}

// Such as "Left out: 2 places the user rejected for this trip." Empty when nothing was
// left out. Each reason is a count of places and why they were left out, such as
// [2, "the user rejected for this trip"].
export function leftOutLines(
  reasons: readonly [count: number, why: string][],
): string[] {
  const given = reasons.filter(([count]) => count > 0);
  if (given.length === 0) {
    return [];
  }
  const parts = given.map(
    ([count, why]) =>
      `${String(count)} ${count === 1 ? "place" : "places"} ${why}`,
  );
  return ["", `Left out: ${parts.join("; ")}.`];
}

// A place, or a point on a route line.
export interface MapPoint {
  latitude: number;
  longitude: number;
}

// As the crow flies.
export function milesBetween(from: MapPoint, to: MapPoint): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const latitudeChange = toRadians(to.latitude - from.latitude);
  const longitudeChange = toRadians(to.longitude - from.longitude);
  const half =
    Math.sin(latitudeChange / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeChange / 2) ** 2;
  return 2 * EARTH_RADIUS_IN_MILES * Math.asin(Math.sqrt(half));
}

export function milesText(miles: number): string {
  return `${miles.toFixed(1)} miles`;
}

// Google's line for each date's day of the week, such as "Saturday, October 10, 2027:
// 11:00 AM – 9:00 PM. Sunday, October 11, 2027: Closed." The hours are for a normal
// week (Google design 2.2).
function hoursOn(place: Place, dates: readonly CalendarDate[]): string {
  if (place.weekdayHoursLines.length === 0) {
    return "not listed";
  }
  return dates
    .map((date) => `${date.longText}: ${weekdayHours(place, date)}.`)
    .join(" ");
}

// Google's lines start with the day's name, such as "Monday: 7:00 AM – 6:00 PM".
function weekdayHours(place: Place, date: CalendarDate): string {
  const weekday = date.weekday;
  const prefix = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}:`;
  const line = place.weekdayHoursLines.find((each) => each.startsWith(prefix));
  // Google spaces its times with thin and narrow no-break spaces.
  return line === undefined
    ? "not listed"
    : line
        .slice(prefix.length)
        .replaceAll(/[\u2009\u202f]/g, " ")
        .trim();
}
