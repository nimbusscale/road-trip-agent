import { MINUTES_IN_DAY, minuteOf } from "./day-timeline.js";
import type { OpeningPeriod } from "./opening-period.js";
import type { TimeOfDay } from "./time-of-day.js";
import { WEEKDAYS, type Weekday } from "./weekday.js";

const MINUTES_IN_WEEK = WEEKDAYS.length * MINUTES_IN_DAY;

// A visit starts in one week, and can run into the next. A period can start in the
// week before. These cover every overlap.
const WEEKS_AROUND = [-1, 0, 1, 2];

// How many minutes of a visit fall within a place's weekly opening periods (technical
// spec section 8, opening hours). The visit's minutes count from the midnight that
// starts `weekday`, so a visit after midnight is 1440 or more. Each period runs from its
// opening to its closing, which can fall on a later day, so a bar open Monday 5 p.m. to
// 2 a.m. is open at 1 a.m. on Tuesday.
export function openMinutesWithin(
  periods: readonly OpeningPeriod[],
  weekday: Weekday,
  visit: { startMinute: number; endMinute: number },
): number {
  const dayStart = WEEKDAYS.indexOf(weekday) * MINUTES_IN_DAY;
  const start = dayStart + visit.startMinute;
  const end = dayStart + visit.endMinute;
  return periods.reduce(
    (total, period) => total + minutesOpen(period, start, end),
    0,
  );
}

function minutesOpen(
  period: OpeningPeriod,
  start: number,
  end: number,
): number {
  if (period.closeDay === null || period.closeTime === null) {
    // Google's one period for a place that's always open.
    return end - start;
  }
  const open = weekMinuteOf(period.openDay, period.openTime);
  let close = weekMinuteOf(period.closeDay, period.closeTime);
  if (close <= open) {
    close += MINUTES_IN_WEEK;
  }
  return WEEKS_AROUND.reduce((total, weeks) => {
    const shift = weeks * MINUTES_IN_WEEK;
    const overlap =
      Math.min(end, close + shift) - Math.max(start, open + shift);
    return total + Math.max(0, overlap);
  }, 0);
}

function weekMinuteOf(day: Weekday, time: TimeOfDay): number {
  return WEEKDAYS.indexOf(day) * MINUTES_IN_DAY + minuteOf(time);
}
