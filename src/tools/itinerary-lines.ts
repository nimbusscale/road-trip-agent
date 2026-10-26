import { durationText } from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";
import { describe } from "./check-results-reply.js";
import {
  dayHeader,
  dayLines,
  dayNumber,
  stayLines,
  stopTimesText,
} from "./day-lines.js";
import type { ReadContext } from "./read-context.js";
import { placeLine, stopLines } from "./stop-lines.js";

// What read_itinerary returns for each scope (tool design 2.1). Each part ends with the
// check results about it, each marked new or already known.

// The whole trip: its ends and dates, each stay followed by its days, the last day, the
// rejected places, and every check result. It gives less about places than a scoped
// read, so a long trip fits (tool design 2.1).
export function wholeLines(context: ReadContext): string[] {
  const { itinerary } = context;
  const stays = itinerary.stays.flatMap((stay) => [
    "",
    ...stayLines(context, stay, "slim"),
    ...stay.days.flatMap((day) => ["", ...dayLines(context, day, "slim")]),
  ]);
  return [
    "The whole itinerary.",
    `Start place: ${itinerary.startPlace === null ? "not set yet" : placeLine(itinerary.startPlace)}.`,
    `End place: ${itinerary.endPlace === null ? "not set yet" : placeLine(itinerary.endPlace)}.`,
    datesLine(context),
    ...stays,
    "",
    ...dayLines(context, itinerary.lastDay, "slim"),
    "",
    ...rejectedLines(context),
    "",
    ...checkLines(context, null),
  ];
}

// Such as "Start date: Sunday, October 10, 2027. 5 days, to Thursday, October 14, 2027.
// 9 h 30 m of road time in all."
function datesLine(context: ReadContext): string {
  const { itinerary } = context;
  const days = `${String(itinerary.dayCount)} ${itinerary.dayCount === 1 ? "day" : "days"}`;
  const road = `${durationText(itinerary.totalDriveTimeInMinutes)} of road time in all, without the drive buffer.`;
  const { startDate, endDate } = itinerary;
  if (startDate === null || endDate === null) {
    return `Start date: not set yet. ${days}. ${road}`;
  }
  return `Start date: ${startDate.longText}. ${days}, to ${endDate.longText}. ${road}`;
}

function rejectedLines(context: ReadContext): string[] {
  const rejected = context.itinerary.rejectedPlaces;
  if (rejected.length === 0) {
    return ["Rejected places: none."];
  }
  return [
    "Rejected places, for the whole trip:",
    ...rejected.map(
      (each) => `- ${placeLine(each.place)}. Reason: "${each.reason}"`,
    ),
  ];
}

// The day, its leg, its stops, and their candidates.
export function dayScopeLines(context: ReadContext, day: Day): string[] {
  return [
    ...dayLines(context, day, "short"),
    "",
    ...checkLines(context, subjectsOfDay(day)),
  ];
}

// The stay, its days and their stops, and stops on other days whose search area is this
// stay, with every candidate's rationale.
export function stayScopeLines(context: ReadContext, stay: Stay): string[] {
  const elsewhere = stopsNearOnOtherDays(context, stay);
  const elsewhereLines =
    elsewhere.length === 0
      ? []
      : [
          "",
          "Stops on other days whose search area is this stay:",
          ...elsewhere.flatMap((stop) => {
            const day = context.calendar.dayOf(context.itinerary, stop);
            return [
              `${dayNumber(context, day)} (${day.id}):`,
              ...stopLines(context, stop, stopTimesText(context, stop), "full"),
            ];
          }),
        ];
  const subjects = new Set([
    stay.id,
    ...stay.days.flatMap((day) => [...subjectsOfDay(day)]),
    ...elsewhere.map((stop) => stop.id),
  ]);
  return [
    ...stayLines(context, stay, "full"),
    ...stay.days.flatMap((day) => ["", ...dayLines(context, day, "full")]),
    ...elsewhereLines,
    "",
    ...checkLines(context, subjects),
  ];
}

// The stop and its full candidate history, under its day's line.
export function stopScopeLines(context: ReadContext, stop: Stop): string[] {
  const day = context.calendar.dayOf(context.itinerary, stop);
  return [
    dayHeader(context, day),
    ...stopLines(context, stop, stopTimesText(context, stop), "full"),
    "",
    ...checkLines(context, new Set([stop.id])),
  ];
}

function subjectsOfDay(day: Day): ReadonlySet<string> {
  return new Set([day.id, ...day.stops.map((stop) => stop.id)]);
}

function stopsNearOnOtherDays(context: ReadContext, stay: Stay): Stop[] {
  return context.itinerary.days
    .filter((day) => !stay.days.some((each) => each === day))
    .flatMap((day) => day.stops.filter((stop) => stop.searchAreaStay === stay));
}

// The current check results whose subject is in `subjects`, or every one when it's
// null. Results that went away aren't shown: the next write's reply reports them.
function checkLines(
  context: ReadContext,
  subjects: ReadonlySet<string> | null,
): string[] {
  const results = context.currentResults.filter(
    (result) => subjects === null || subjects.has(result.subjectId),
  );
  if (results.length === 0) {
    return ["Check results: none."];
  }
  return [
    "Check results:",
    ...results.map(
      (result) =>
        `- ${describe(context.newResults.has(result) ? "New" : "Already known", result)}`,
    ),
  ];
}
