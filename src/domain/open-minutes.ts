import { MINUTES_IN_DAY, minuteOf } from "./day-timeline.js";
import type { OpeningPeriod } from "./opening-period.js";
import type { TimeOfDay } from "./time-of-day.js";
import { WEEKDAYS, type Weekday } from "./weekday.js";

const MINUTES_IN_WEEK = WEEKDAYS.length * MINUTES_IN_DAY;

// A visit starts in one week, and can run into the next. A period can start in the
// week before. These cover every overlap.
const WEEKS_AROUND = [-1, 0, 1, 2];

// A visit's minutes count from the midnight that starts its weekday, so a visit after
// midnight is 1440 or more.
export interface VisitMinutes {
  startMinute: number;
  endMinute: number;
}

// The first time a place opens or closes during a visit, in the visit's minutes. The
// opening-hours warning gives it (technical spec section 8).
export interface OpeningChange {
  change: "opens" | "closes";
  minute: number;
}

// How many minutes of a visit fall within a place's weekly opening periods (technical
// spec section 8, opening hours). Each period runs from its opening to its closing,
// which can fall on a later day, so a bar open Monday 5 p.m. to 2 a.m. is open at 1 a.m.
// on Tuesday.
export function openMinutesWithin(
  periods: readonly OpeningPeriod[],
  weekday: Weekday,
  visit: VisitMinutes,
): number {
  const { start, end } = inWeek(weekday, visit);
  return periods.reduce(
    (total, period) =>
      total +
      spansOf(period).reduce(
        (sum, span) =>
          sum +
          Math.max(0, Math.min(end, span.close) - Math.max(start, span.open)),
        0,
      ),
    0,
  );
}

// The first opening or closing after the visit starts and before it ends. Null when
// the place neither opens nor closes during it.
export function openingChangeWithin(
  periods: readonly OpeningPeriod[],
  weekday: Weekday,
  visit: VisitMinutes,
): OpeningChange | null {
  const { start, end } = inWeek(weekday, visit);
  const dayStart = start - visit.startMinute;
  const changes = periods
    .flatMap(spansOf)
    .flatMap((span): OpeningChange[] => [
      { change: "opens", minute: span.open },
      { change: "closes", minute: span.close },
    ])
    .filter((each) => each.minute > start && each.minute < end)
    .sort((one, other) => one.minute - other.minute);
  const first = changes[0];
  return first === undefined
    ? null
    : { change: first.change, minute: first.minute - dayStart };
}

function inWeek(
  weekday: Weekday,
  visit: VisitMinutes,
): { start: number; end: number } {
  const dayStart = WEEKDAYS.indexOf(weekday) * MINUTES_IN_DAY;
  return {
    start: dayStart + visit.startMinute,
    end: dayStart + visit.endMinute,
  };
}

// The period in each week around the visit, in minutes from the start of the visit's
// week. Google's one period for a place that's always open never closes.
function spansOf(period: OpeningPeriod): { open: number; close: number }[] {
  if (period.closeDay === null || period.closeTime === null) {
    return [{ open: -Infinity, close: Infinity }];
  }
  const open = weekMinuteOf(period.openDay, period.openTime);
  let close = weekMinuteOf(period.closeDay, period.closeTime);
  if (close <= open) {
    close += MINUTES_IN_WEEK;
  }
  return WEEKS_AROUND.map((weeks) => ({
    open: open + weeks * MINUTES_IN_WEEK,
    close: close + weeks * MINUTES_IN_WEEK,
  }));
}

function weekMinuteOf(day: Weekday, time: TimeOfDay): number {
  return WEEKDAYS.indexOf(day) * MINUTES_IN_DAY + minuteOf(time);
}
