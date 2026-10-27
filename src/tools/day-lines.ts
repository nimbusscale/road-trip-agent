import {
  clockText,
  durationText,
  placeText,
  sentence,
} from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import { minuteOfScheduleTime } from "../domain/day-timeline.js";
import type { ScheduleEntry } from "../domain/schedule-entry.js";
import type { ScheduleTime } from "../domain/schedule-time.js";
import type { Stay } from "../domain/stay.js";
import { StayDay } from "../domain/stay-day.js";
import type { Stop } from "../domain/stop.js";
import type { Waypoint } from "../domain/waypoint.js";
import { clockTextOf } from "./clock-time.js";
import type { ReadContext } from "./read-context.js";
import {
  approvalLine,
  candidateLines,
  countLines,
  type Detail,
  pickedPlaceText,
  placeLine,
  stopLines,
} from "./stop-lines.js";

// How read_itinerary shows a stay and a day (tool design 2.1). Days, stays, and sets are
// counted from 1, as people count them (domain model section 1).

export function dayNumber(
  context: Pick<ReadContext, "itinerary" | "calendar">,
  day: Day,
): string {
  return `Day ${String(context.calendar.orderOf(context.itinerary, day) + 1)}`;
}

// The stay's line, then its lodging, candidates, and weather text. A whole read gives
// the lodging with its town, a count of the other candidates, and the weather line
// without its text (tool design 2.1).
export function stayLines(
  context: ReadContext,
  stay: Stay,
  detail: Detail,
): string[] {
  const order = context.calendar.orderOf(context.itinerary, stay);
  const isSlim = detail === "slim";
  return [
    `Stay ${String(order + 1)} (${stay.id}): ${placeLine(stay.place)}. ${nightsText(context, stay)}`,
    lodgingLine(stay, isSlim),
    ...(isSlim
      ? countLines(stay.lodgingCandidates, stay.lodging, "Lodging candidates")
      : candidateLines(
          stay.lodgingCandidates,
          stay.lodging,
          detail,
          "Lodging candidates",
        )),
    weatherLine(context, stay, isSlim),
  ];
}

function lodgingLine(stay: Stay, isSlim: boolean): string {
  const lodging = stay.lodging;
  if (lodging === null) {
    return `- Lodging: ${stay.lodgingCandidates.length === 0 ? "no candidates yet" : "none selected yet"}.`;
  }
  return isSlim
    ? `- Lodging: ${pickedPlaceText(lodging)}.`
    : `- Lodging: ${placeText(lodging)} (${lodging.id}).`;
}

// Such as "3 nights, Days 1 to 3, from Sunday, October 10, 2027 to the morning of
// Wednesday, October 13, 2027."
function nightsText(context: ReadContext, stay: Stay): string {
  const days = stay.days.map((day) => dayNumber(context, day));
  const span =
    days.length === 1
      ? (days[0] ?? "")
      : `Days ${(days[0] ?? "").replace("Day ", "")} to ${(days.at(-1) ?? "").replace("Day ", "")}`;
  const dates = context.calendar.datesOf(context.itinerary, stay);
  const first = dates[0];
  const last = dates.at(-1);
  const when =
    first === undefined || last === undefined
      ? ""
      : `, from ${first.longText} to the morning of ${last.longText}`;
  return `${nightCountText(stay.nightCount)}, ${span}${when}.`;
}

function nightCountText(nights: number): string {
  return nights === 1 ? "1 night" : `${String(nights)} nights`;
}

// The weather worker's text, marked out of date when the stay's place, dates, or
// activities no longer match the ones it was written for (domain model 4.1). A whole
// read leaves the text out, and keeps where it came from and when, which is what the
// forecast note works from (technical spec section 8).
function weatherLine(
  context: ReadContext,
  stay: Stay,
  isSlim: boolean,
): string {
  const text = stay.weatherText;
  if (text === null) {
    return "- Weather and clothing: none yet.";
  }
  const label = text.label === "forecast" ? "forecast" : "seasonal averages";
  const outOfDate = context.calendar.isWeatherOutOfDate(context.itinerary, stay)
    ? " Out of date: the stay's place, dates, or activities have changed since it was written."
    : "";
  const written = `- Weather and clothing, from ${label}, written ${text.writtenOnDate.longText}`;
  return isSlim
    ? `${written}.${outOfDate}`
    : `${written}: "${text.guidance}"${outOfDate}`;
}

// The day's line, its leg and approvals, then its schedule, with each stop in it.
export function dayLines(
  context: ReadContext,
  day: Day,
  detail: Detail,
): string[] {
  return [
    dayHeader(context, day),
    ...legLines(context, day),
    ...day.approvals.map((approval) => approvalLine(context, day, approval)),
    ...scheduleLines(context, day, detail),
  ];
}

// Such as "Day 2 (day_…), Monday, October 11, 2027: Moab. Starts 5:30 a.m., the day's own
// start time."
export function dayHeader(context: ReadContext, day: Day): string {
  const { itinerary, calendar } = context;
  const date = calendar.dateOf(itinerary, day)?.longText ?? "date not set yet";
  const location =
    calendar.locationOf(itinerary, day) ?? "start or end place not set yet";
  const marks = [
    ...(day instanceof StayDay && day.isRestDay ? [" Rest day."] : []),
    ...(day.kind === "lastDay" ? [" Last day."] : []),
  ].join("");
  const start = clockTextOf(calendar.startTimeOf(itinerary, day));
  const whose =
    day.ownStartTime === null
      ? "the usual start time"
      : "the day's own start time";
  return `${dayNumber(context, day)} (${day.id}), ${date}: ${location}.${marks} Starts ${start}, ${whose}.`;
}

// The leg's road time is without the drive buffer. The driving with it is what the
// schedule and the daily driving check use (domain model 4.1). The route line never
// goes to the model (Google design 2.3). A line under it gives each waypoint, with its
// reason.
function legLines(context: ReadContext, day: Day): string[] {
  const leg = day.leg;
  if (leg === null) {
    return ["- No leg."];
  }
  const driving = context.calendar.drivingInMinutesOf(context.itinerary, day);
  const withBuffer =
    driving === null
      ? ""
      : `, ${durationText(driving)} of driving with the drive buffer`;
  return [
    `- Leg: ${String(leg.distanceInMiles)} miles, ${durationText(leg.driveTimeInMinutes)} of road time${withBuffer}.`,
    ...day.waypoints.map(
      (waypoint) => `  - Waypoint: ${waypointText(waypoint)}`,
    ),
  ];
}

// Such as 'Belfast (place_…), City, Belfast. Reason: "steer onto US-1".' Also in the
// replies of the tools that set or clear waypoints.
export function waypointText(waypoint: Waypoint): string {
  return `${placeLine(waypoint.place)}. Reason: "${waypoint.reason}".`;
}

// In time order: drives, free time, and stops, with the arrival where the party sleeps,
// or at the end place, after the last drive (domain model 4.1).
function scheduleLines(
  context: ReadContext,
  day: Day,
  detail: Detail,
): string[] {
  const schedule = context.calendar.scheduleOf(context.itinerary, day);
  if (schedule.length === 0) {
    return ["Schedule: nothing yet."];
  }
  return [
    "Schedule:",
    ...schedule.flatMap((entry) => entryLines(context, entry, detail)),
    ...arrivalLines(context, day, schedule.at(-1)),
  ];
}

function entryLines(
  context: ReadContext,
  entry: ScheduleEntry,
  detail: Detail,
): string[] {
  const times = timesText(entry);
  if (entry.stop !== null) {
    return stopLines(context, entry.stop, times, detail);
  }
  return [`- ${times}: ${entry.kind === "drive" ? "drive" : "free time"}.`];
}

function arrivalLines(
  context: ReadContext,
  day: Day,
  last: ScheduleEntry | undefined,
): string[] {
  const to = context.calendar.toPlaceOf(context.itinerary, day);
  if (last?.kind !== "drive" || to === null) {
    return [];
  }
  return last.endTime === null
    ? [`Arrival at ${placeText(to)}: time not known yet.`]
    : [
        sentence(
          `Arrives at ${placeText(to)} at ${scheduleText(last.endTime)}`,
        ),
      ];
}

// A stop's arrival and end in its day's schedule, for a stop shown outside its day, such
// as one near a stay on another stay's day.
export function stopTimesText(context: ReadContext, stop: Stop): string {
  const day = context.calendar.dayOf(context.itinerary, stop);
  const entry = context.calendar
    .scheduleOf(context.itinerary, day)
    .find((each) => each.stop === stop);
  return entry === undefined ? "Time not known yet" : timesText(entry);
}

// Such as "12:00 p.m. to 12:45 p.m.", or one time for a stop that takes none, such as
// one with no place yet.
function timesText(entry: ScheduleEntry): string {
  const { startTime, endTime } = entry;
  if (startTime === null) {
    return "Time not known yet";
  }
  if (endTime === null || endTime.equals(startTime)) {
    return scheduleText(startTime);
  }
  return `${scheduleText(startTime)} to ${scheduleText(endTime)}`;
}

function scheduleText(time: ScheduleTime): string {
  return clockText(minuteOfScheduleTime(time));
}
