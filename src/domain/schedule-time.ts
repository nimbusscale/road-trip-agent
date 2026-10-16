import type { TimeOfDay } from "./time-of-day.js";

// A time in a day's schedule (domain model section 1, the `scheduleTime` type): a time
// of day, plus whether it falls after midnight, on the next calendar date. Example: a
// stop's setTime of 1:00 a.m., next day, for stargazing after Moab Day 4. It's stored as
// the time's "HH:MM" text and the next-day flag (persistence design, section 2).
export class ScheduleTime {
  readonly time: TimeOfDay;
  readonly isNextDay: boolean;

  constructor(time: TimeOfDay, isNextDay: boolean) {
    this.time = time;
    this.isNextDay = isNextDay;
  }

  equals(other: ScheduleTime): boolean {
    return this.isNextDay === other.isNextDay && this.time.equals(other.time);
  }
}
