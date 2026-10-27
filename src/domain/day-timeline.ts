import type { ScheduleEntry, ScheduleEntryKind } from "./schedule-entry.js";
import { ScheduleTime } from "./schedule-time.js";
import type { Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";

export const MINUTES_IN_DAY = 24 * 60;

const MINUTES_IN_HOUR = 60;

// A schedule entry timed in minutes from the midnight the day starts after, so a time
// after midnight is 1440 or more. Null when the time isn't known yet.
export interface TimelineEntry {
  readonly kind: ScheduleEntryKind;
  readonly stop: Stop | null;
  readonly startMinute: number | null;
  readonly endMinute: number | null;
}

export interface TimelineInput {
  stops: readonly Stop[];
  startMinute: number;
  // False on a day with no drives: a rest day, a day that stays put with no selected
  // stop yet, or a day whose ends aren't known yet.
  hasDrives: boolean;
  // Each segment's drive time with the buffer, in route order. Null when they aren't
  // known, such as before the day's leg is routed for its selected stops. On a day with
  // no drives, an empty list, or null while the day's ends aren't known, since the
  // drives there aren't known to be 0.
  driveMinutes: readonly number[] | null;
}

// Works out a day's schedule (domain model 4.1, "How the schedule is worked out").
export function timelineOf(input: TimelineInput): TimelineEntry[] {
  return new TimelineBuilder(input).build();
}

export function minuteOf(time: TimeOfDay): number {
  return time.hours * MINUTES_IN_HOUR + time.minutes;
}

export function minuteOfScheduleTime(time: ScheduleTime): number {
  return minuteOf(time.time) + (time.isNextDay ? MINUTES_IN_DAY : 0);
}

// A schedule time holds only the day's own date and the next one. A time later than
// that is left empty.
export function scheduleTimeAt(minute: number | null): ScheduleTime | null {
  if (minute === null || minute >= 2 * MINUTES_IN_DAY) {
    return null;
  }
  const inDay = minute % MINUTES_IN_DAY;
  return new ScheduleTime(
    new TimeOfDay(Math.floor(inDay / MINUTES_IN_HOUR), inDay % MINUTES_IN_HOUR),
    minute >= MINUTES_IN_DAY,
  );
}

export function toScheduleEntry(entry: TimelineEntry): ScheduleEntry {
  return {
    kind: entry.kind,
    stop: entry.stop,
    startTime: scheduleTimeAt(entry.startMinute),
    endTime: scheduleTimeAt(entry.endMinute),
  };
}

function plus(minute: number | null, minutes: number | null): number | null {
  return minute === null || minutes === null ? null : minute + minutes;
}

class TimelineBuilder {
  readonly #input: TimelineInput;
  readonly #entries: TimelineEntry[] = [];
  // Stops with no selected place since the last selected stop. Each goes where its time
  // falls: within the free time before the next selected stop, which it splits, or
  // after the drive. One with no time stays next to the stops around it.
  #waiting: TimelineEntry[] = [];
  // When the party can leave: the end of the last selected stop, or the day's start.
  #departure: number | null;
  // When the last item with a time ends. A stop with no selected place holds its spot,
  // so nothing after it arrives before then.
  #heldUntil: number | null;
  #segment = 0;

  constructor(input: TimelineInput) {
    this.#input = input;
    this.#departure = input.startMinute;
    this.#heldUntil = input.startMinute;
  }

  build(): TimelineEntry[] {
    for (const stop of this.#input.stops) {
      if (stop.visitTimeInMinutes === null) {
        this.#addUnselected(stop);
      } else {
        this.#addSelected(stop, stop.visitTimeInMinutes);
      }
    }
    this.#addLastDrive();
    return this.#entries;
  }

  // It takes no time. With a set time, it shows then, or when the item before it ends
  // if that's later. With none, it has no times.
  #addUnselected(stop: Stop): void {
    const at =
      stop.setTime === null || this.#heldUntil === null
        ? null
        : Math.max(minuteOfScheduleTime(stop.setTime), this.#heldUntil);
    if (stop.setTime !== null) {
      this.#heldUntil = at;
    }
    this.#waiting.push({ kind: "stop", stop, startMinute: at, endMinute: at });
  }

  // The party leaves as soon as it can, so a wait for a set time shows as free time
  // after the drive, where it ends.
  #addSelected(stop: Stop, visitMinutes: number): void {
    const drive = this.#nextDrive();
    const driveEnd = plus(this.#departure, drive);
    const arrival = this.#arrivalAt(driveEnd, stop);
    this.#addDriveThenWait(driveEnd, arrival);
    const end = plus(arrival, visitMinutes);
    this.#entries.push({
      kind: "stop",
      stop,
      startMinute: arrival,
      endMinute: end,
    });
    this.#departure = end;
    this.#heldUntil = end;
  }

  // The drive, then the free time until the arrival, with the waiting stops in the
  // day's order. One whose time falls within the free time splits it. One whose time
  // falls during the drive comes right after it, since the drive passes it. On a day
  // with no drives, the free time runs from the departure.
  #addDriveThenWait(driveEnd: number | null, arrival: number | null): void {
    if (this.#input.hasDrives) {
      this.#push("drive", this.#departure, driveEnd);
    }
    const from = this.#pushSplitting(this.#waiting, driveEnd);
    this.#waiting = [];
    if (from !== null && arrival !== null && arrival > from) {
      this.#push("freeTime", from, arrival);
    }
  }

  // Pushes the stops, with free time from `from` until each one whose time is later.
  // Returns when the last of them is, or `from` when that's later.
  #pushSplitting(
    entries: readonly TimelineEntry[],
    from: number | null,
  ): number | null {
    let at = from;
    for (const entry of entries) {
      if (at !== null && entry.startMinute !== null && entry.startMinute > at) {
        this.#push("freeTime", at, entry.startMinute);
        at = entry.startMinute;
      }
      this.#entries.push(entry);
    }
    return at;
  }

  #arrivalAt(earliest: number | null, stop: Stop): number | null {
    if (earliest === null || this.#heldUntil === null) {
      return null;
    }
    const setMinute =
      stop.setTime === null ? earliest : minuteOfScheduleTime(stop.setTime);
    return Math.max(earliest, this.#heldUntil, setMinute);
  }

  // The drive to where the party sleeps, or to the end place. Its times aren't known
  // while a stop with no selected place comes after the last selected stop.
  #addLastDrive(): void {
    const hasWaiting = this.#waiting.length > 0;
    this.#entries.push(...this.#waiting);
    if (!this.#input.hasDrives) {
      return;
    }
    const drive = this.#nextDrive();
    const start = hasWaiting ? null : this.#departure;
    this.#push("drive", start, plus(start, drive));
  }

  // 0 on a day with no drives, or null while its ends aren't known.
  #nextDrive(): number | null {
    if (!this.#input.hasDrives) {
      return this.#input.driveMinutes === null ? null : 0;
    }
    const drive = this.#input.driveMinutes?.[this.#segment] ?? null;
    this.#segment += 1;
    return drive;
  }

  #push(
    kind: ScheduleEntryKind,
    startMinute: number | null,
    endMinute: number | null,
  ): void {
    const known = startMinute !== null && endMinute !== null;
    this.#entries.push({
      kind,
      stop: null,
      startMinute: known ? startMinute : null,
      endMinute: known ? endMinute : null,
    });
  }
}
