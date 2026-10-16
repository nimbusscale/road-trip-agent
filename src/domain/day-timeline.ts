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
  // False on a day with no drives: a rest day, or a day that stays put with no
  // selected stop yet.
  hasDrives: boolean;
  // Each segment's drive time with the buffer, in route order. Null when they aren't
  // known, such as before the day's leg is routed for its selected stops.
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

  // The party waits before driving, not after, so a wait shows as free time before the
  // drive.
  #addSelected(stop: Stop, visitMinutes: number): void {
    const drive = this.#nextDrive();
    const earliest = plus(this.#departure, drive);
    const arrival = this.#arrivalAt(earliest, stop);
    const driveStart = plus(arrival, drive === null ? null : -drive);
    this.#addFreeTimeUntil(driveStart);
    if (this.#input.hasDrives) {
      this.#push("drive", driveStart, arrival);
    }
    this.#entries.push(...this.#waiting);
    this.#waiting = [];
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

  // The free time from the departure until the drive starts, with the waiting stops
  // whose times fall within it. A waiting stop with no time before one of those goes
  // with it, so the stops stay in the day's order.
  #addFreeTimeUntil(freeEnd: number | null): void {
    let from = this.#departure;
    if (from === null || freeEnd === null) {
      return;
    }
    const lastWithin = this.#waiting.findLastIndex(
      (entry) => entry.startMinute !== null && entry.startMinute < freeEnd,
    );
    for (const entry of this.#waiting.slice(0, lastWithin + 1)) {
      if (entry.startMinute !== null && entry.startMinute > from) {
        this.#push("freeTime", from, entry.startMinute);
        from = entry.startMinute;
      }
      this.#entries.push(entry);
    }
    this.#waiting = this.#waiting.slice(lastWithin + 1);
    if (freeEnd > from) {
      this.#push("freeTime", from, freeEnd);
    }
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

  // 0 on a day with no drives.
  #nextDrive(): number | null {
    if (!this.#input.hasDrives) {
      return 0;
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
