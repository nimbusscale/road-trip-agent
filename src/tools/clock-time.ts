import { clockText } from "../domain/check-text.js";
import { ScheduleTime } from "../domain/schedule-time.js";
import { TimeOfDay } from "../domain/time-of-day.js";

const MINUTES_IN_HOUR = 60;
const NOON_HOUR = 12;

// How the tools write a time of day, in and out: a clock time, such as "8:00 a.m." or
// "1:30 p.m." (tool design, section 2.1). The model reads it the way the user says it.
export const CLOCK_TIME_TEXT = /^(1[0-2]|[1-9]):([0-5]\d) (a\.m\.|p\.m\.)$/;

export const CLOCK_TIME_ERROR =
  'A time is written as a clock time, such as "8:00 a.m." or "1:30 p.m."';

// The tool's input schema has checked the text against CLOCK_TIME_TEXT.
export function timeOfDayFromClockText(text: string): TimeOfDay {
  const match = CLOCK_TIME_TEXT.exec(text);
  if (match === null) {
    throw new TypeError(`"${text}" isn't a clock time.`);
  }
  const [, hourText, minuteText, half] = match;
  const onClock = Number(hourText) % NOON_HOUR;
  const hours = half === "p.m." ? onClock + NOON_HOUR : onClock;
  return new TimeOfDay(hours, Number(minuteText));
}

export function clockTextOf(time: TimeOfDay): string {
  return clockText(time.hours * MINUTES_IN_HOUR + time.minutes);
}

// A time after midnight ends with this, as a read writes it, such as "1:00 a.m. the next
// day", so it can't be read as an early start (tool design 2.1).
export const NEXT_DAY_TEXT = " the next day";

// A stop's set time: a clock time, which can end with NEXT_DAY_TEXT.
export function isScheduleTimeText(text: string): boolean {
  return CLOCK_TIME_TEXT.test(withoutNextDay(text));
}

// The tool's input schema has checked the text with isScheduleTimeText().
export function scheduleTimeFromText(text: string): ScheduleTime {
  const time = withoutNextDay(text);
  return new ScheduleTime(timeOfDayFromClockText(time), time !== text);
}

function withoutNextDay(text: string): string {
  return text.endsWith(NEXT_DAY_TEXT)
    ? text.slice(0, -NEXT_DAY_TEXT.length)
    : text;
}
