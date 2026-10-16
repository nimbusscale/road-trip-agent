import type { CheckContext } from "./check-context.js";
import { CheckResult } from "./check-result.js";
import {
  clockText,
  durationText,
  placeText,
  sentence,
  stayText,
  stopText,
} from "./check-text.js";
import type { CalendarDate } from "./calendar-date.js";
import type { Day } from "./day.js";
import { minuteOfScheduleTime } from "./day-timeline.js";
import { openingChangeWithin, type VisitMinutes } from "./open-minutes.js";
import type { Place } from "./place.js";
import type { ScheduleEntry } from "./schedule-entry.js";
import type { Stop } from "./stop.js";

const ESTIMATES = "Times are estimates from average drive times.";
const MAY_BE_TOO_EARLY =
  "An earlier stop on this day has no place picked yet, so this time may be too early.";

// The checks about each stop: opening hours, late for a set time, and whether its
// search area fits its day (technical spec section 8).
export function stopCheckResults(context: CheckContext): CheckResult[] {
  return context.itinerary.days.flatMap((day) => {
    const schedule = context.calendar.scheduleOf(context.itinerary, day);
    return day.stops.flatMap((stop, index) => {
      const entry = schedule.find((each) => each.stop === stop) ?? null;
      const hasUnselectedStopBefore = day.stops
        .slice(0, index)
        .some((before) => before.selectedPlace === null);
      return [
        openingHoursResult(context, { day, stop, entry }),
        lateResult(context, stop, entry),
        searchAreaResult(context, day, stop),
      ]
        .filter((result) => result !== null)
        .map((result) =>
          hasUnselectedStopBefore ? markedTooEarly(result) : result,
        );
    });
  });
}

// When a stop's opening hours approval still covers its warning (domain model 4.8).
// A stop holds only opening hours approvals.
export function isOpeningHoursApprovalApplying(
  context: CheckContext,
  stop: Stop,
): boolean {
  const approval = stop.approvals[0];
  const open = context.calendar.openTimeInMinutesOf(context.itinerary, stop);
  return (
    approval !== undefined &&
    open !== null &&
    open >= approval.approvedOpenTimeInMinutes
  );
}

interface StopInDay {
  day: Day;
  stop: Stop;
  entry: ScheduleEntry | null;
}

// Checked from the stop's arrival to the end of its visit, against its selected
// place's weekly hours. A visit that's open the whole time gives nothing.
function openingHoursResult(
  context: CheckContext,
  { day, stop, entry }: StopInDay,
): CheckResult | null {
  const place = stop.selectedPlace;
  if (place === null) {
    return null;
  }
  if (place.openingPeriods.length === 0) {
    return resultFor(
      "openingHoursNotKnown",
      stop,
      `Hours not confirmed for ${placeText(place)}. Check before you go.`,
    );
  }
  const { itinerary, calendar } = context;
  const open = calendar.openTimeInMinutesOf(itinerary, stop);
  const visit = visitOf(entry);
  const date = calendar.dateOf(itinerary, day);
  if (open === null || visit === null || date === null) {
    return null;
  }
  if (open >= visit.endMinute - visit.startMinute) {
    return null;
  }
  return new CheckResult({
    check: open === 0 ? "openingHoursClosed" : "openingHoursNotLongEnough",
    subjectId: stop.id,
    text: openingHoursText(place, { date, visit, open }),
    isApproved: isOpeningHoursApprovalApplying(context, stop),
    hasUnselectedStopBefore: false,
  });
}

// Such as "Milt's closes at 12:30 p.m. You'd get there at 12:00 p.m., with
// 1 h planned. Times are estimates from average drive times."
function openingHoursText(
  place: Place,
  at: { date: CalendarDate; visit: VisitMinutes; open: number },
): string {
  const { date, visit, open } = at;
  const change = openingChangeWithin(place.openingPeriods, date.weekday, visit);
  const planned = durationText(visit.endMinute - visit.startMinute);
  let found = `${placeText(place)} is open for only ${durationText(open)} of the visit.`;
  if (open === 0) {
    found = `${placeText(place)} is closed for the whole visit, on ${date.longText}.`;
  } else if (change !== null) {
    found = sentence(
      `${placeText(place)} ${change.change} at ${clockText(change.minute)}`,
    );
  }
  return `${found} You'd get there at ${clockText(visit.startMinute)}, with ${planned} planned. ${ESTIMATES}`;
}

// A stop with no selected place takes no time, so a later stop may really come later,
// and an opening-hours warning may go away (domain model 3.3). Other checks keep their
// results unmarked: a late warning would only get worse.
function markedTooEarly(result: CheckResult): CheckResult {
  if (
    result.check !== "openingHoursNotLongEnough" &&
    result.check !== "openingHoursClosed"
  ) {
    return result;
  }
  return new CheckResult({
    check: result.check,
    subjectId: result.subjectId,
    text: `${result.text} ${MAY_BE_TOO_EARLY}`,
    isApproved: result.isApproved,
    hasUnselectedStopBefore: true,
  });
}

// The party reaches the stop more than the late allowance after its set time. A stop
// with no place yet counts too, when it has a set time.
function lateResult(
  context: CheckContext,
  stop: Stop,
  entry: ScheduleEntry | null,
): CheckResult | null {
  const setTime = stop.setTime;
  const startTime = entry?.startTime ?? null;
  if (setTime === null || startTime === null) {
    return null;
  }
  const arrival = minuteOfScheduleTime(startTime);
  const set = minuteOfScheduleTime(setTime);
  if (arrival <= set + context.settings.lateAllowanceMinutes) {
    return null;
  }
  return resultFor(
    "lateForSetTime",
    stop,
    sentence(
      `You'd reach ${stopText(stop)} at ${clockText(arrival)}, but it's set for ${clockText(set)}`,
    ),
  );
}

// A stop near a stay, or near the start or end place, on a day that no longer starts
// or ends there. A move or a change to the stays can cause it (domain model 4.4, 4.6).
function searchAreaResult(
  context: CheckContext,
  day: Day,
  stop: Stop,
): CheckResult | null {
  const misfit = misfitOf(context, day, stop);
  return misfit === null
    ? null
    : resultFor(
        "searchAreaDoesNotFitDay",
        stop,
        `${stopText(stop)} is near ${misfit}.`,
      );
}

// What the stop is near, and how its day no longer fits it.
function misfitOf(context: CheckContext, day: Day, stop: Stop): string | null {
  const { itinerary, calendar } = context;
  const stay = stop.searchAreaStay;
  if (
    stay !== null &&
    stay !== calendar.startStayOf(itinerary, day) &&
    stay !== calendar.endStayOf(itinerary, day)
  ) {
    return `${stayText(stay)}, but its day no longer starts or ends there`;
  }
  if (
    stop.searchArea === "nearStartPlace" &&
    calendar.previousDay(itinerary, day) !== null
  ) {
    return "the start place, but it's no longer on the first day";
  }
  if (stop.searchArea === "nearEndPlace" && day !== itinerary.lastDay) {
    return "the end place, but it's no longer on the last day";
  }
  return null;
}

function resultFor(
  check: "openingHoursNotKnown" | "lateForSetTime" | "searchAreaDoesNotFitDay",
  stop: Stop,
  text: string,
): CheckResult {
  return new CheckResult({
    check,
    subjectId: stop.id,
    text,
    isApproved: false,
    hasUnselectedStopBefore: false,
  });
}

function visitOf(entry: ScheduleEntry | null): VisitMinutes | null {
  const start = entry?.startTime ?? null;
  const end = entry?.endTime ?? null;
  if (start === null || end === null) {
    return null;
  }
  return {
    startMinute: minuteOfScheduleTime(start),
    endMinute: minuteOfScheduleTime(end),
  };
}
