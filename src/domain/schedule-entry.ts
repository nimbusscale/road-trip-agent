import type { ScheduleTime } from "./schedule-time.js";
import type { Stop } from "./stop.js";

export const SCHEDULE_ENTRY_KINDS = ["drive", "stop", "freeTime"] as const;

export type ScheduleEntryKind = (typeof SCHEDULE_ENTRY_KINDS)[number];

// One item in a day's schedule: a drive, a stop, or free time (domain model 4.1). The
// calendar's scheduleOf() works it out when the day is read, and it's never stored.
export interface ScheduleEntry {
  readonly kind: ScheduleEntryKind;
  // The stop, for a stop entry. Empty for the others.
  readonly stop: Stop | null;
  // Empty when the time isn't known yet. The UI shows "time set once a place is
  // picked."
  readonly startTime: ScheduleTime | null;
  readonly endTime: ScheduleTime | null;
}
