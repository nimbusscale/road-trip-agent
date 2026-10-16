import { z } from "zod";

import { CALENDAR_DATE_TEXT, CalendarDate } from "../domain/calendar-date.js";
import { ScheduleTime } from "../domain/schedule-time.js";
import { TIME_OF_DAY_TEXT, TimeOfDay } from "../domain/time-of-day.js";

// The values the plan document stores as text (persistence design, section 2), parsed
// back into the domain's types.

// A time of day is stored as "HH:MM" text on a 24-hour clock.
export const timeOfDaySchema = z
  .string()
  .regex(TIME_OF_DAY_TEXT)
  .transform((text) => TimeOfDay.fromText(text));

// A date is stored as "YYYY-MM-DD" text.
export const calendarDateSchema = z
  .string()
  .regex(CALENDAR_DATE_TEXT)
  .transform((text) => CalendarDate.fromText(text));

// A time in a day's schedule is stored as its time, and whether it falls on the next
// calendar date.
export const scheduleTimeSchema = z
  .strictObject({ time: timeOfDaySchema, isNextDay: z.boolean() })
  .transform((fields) => new ScheduleTime(fields.time, fields.isNextDay));

// Links to several objects, such as a day's waypoints, are stored as a list of IDs.
export const idListSchema = z.array(z.string()).readonly();
