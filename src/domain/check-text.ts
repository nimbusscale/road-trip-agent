import { MINUTES_IN_DAY } from "./day-timeline.js";
import type { Place } from "./place.js";
import type { Stay } from "./stay.js";
import type { Stop } from "./stop.js";

const MINUTES_IN_HOUR = 60;
const NOON_HOUR = 12;

// How a check result names things and times, in words the coordinator can pass on
// (technical spec section 8).

// Such as "5 h 20 m", "5 h", or "45 m", the way the tools give drive times.
export function durationText(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_IN_HOUR);
  const rest = minutes % MINUTES_IN_HOUR;
  if (hours === 0) {
    return `${String(rest)} m`;
  }
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} m`;
}

// A time in a day's schedule, in minutes from the midnight the day starts after, such
// as "12:30 p.m." or "1:00 a.m. the next day".
export function clockText(minute: number): string {
  const inDay = minute % MINUTES_IN_DAY;
  const hours = Math.floor(inDay / MINUTES_IN_HOUR);
  const minutes = String(inDay % MINUTES_IN_HOUR).padStart(2, "0");
  const half = hours < NOON_HOUR ? "a.m." : "p.m.";
  const onClock = hours % NOON_HOUR === 0 ? NOON_HOUR : hours % NOON_HOUR;
  const later = minute >= MINUTES_IN_DAY ? " the next day" : "";
  return `${String(onClock)}:${minutes} ${half}${later}`;
}

// Ends the text with a period, unless it ends with one already, such as "p.m.".
export function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

// A place Google gave no name, and no agent named yet, shows as its address.
export function placeText(place: Place): string {
  return place.name ?? place.address;
}

// A stop has no name of its own: its purpose, and its selected place when it has one,
// such as "burgers at Milt's".
export function stopText(stop: Stop): string {
  const place = stop.selectedPlace;
  return place === null
    ? stop.purpose
    : `${stop.purpose} at ${placeText(place)}`;
}

// A stay by its town, such as "the Moab stay".
export function stayText(stay: Stay): string {
  return `the ${placeText(stay.place)} stay`;
}
