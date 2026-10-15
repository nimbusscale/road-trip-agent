import { RuleError } from "./rule-error.js";

const MINUTES_IN_HOUR = 60;
const HOURS_IN_DAY = 24;

// "HH:MM" on a 24-hour clock, such as "08:00" or "13:00".
export const TIME_OF_DAY_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/;

// A time of day, with no date (domain model section 1, the `time` type), such as a trip
// brief's usualStartTime. It's stored as "HH:MM" text (persistence design, section 2).
// A time in a day's schedule, which can fall after midnight, is phase 17's scheduleTime.
export class TimeOfDay {
  readonly hours: number;
  readonly minutes: number;

  constructor(hours: number, minutes: number) {
    if (!isWholeBelow(hours, HOURS_IN_DAY)) {
      throw new RuleError(
        `A time of day's hours are 0 to 23. It was given ${String(hours)}.`,
      );
    }
    if (!isWholeBelow(minutes, MINUTES_IN_HOUR)) {
      throw new RuleError(
        `A time of day's minutes are 0 to 59. It was given ${String(minutes)}.`,
      );
    }
    this.hours = hours;
    this.minutes = minutes;
  }

  static fromText(text: string): TimeOfDay {
    if (!TIME_OF_DAY_TEXT.test(text)) {
      throw new RuleError(
        `A time of day is written HH:MM on a 24-hour clock, such as 08:00 or 13:00. It was given "${text}".`,
      );
    }
    const [hours, minutes] = text.split(":").map(Number);
    return new TimeOfDay(hours ?? 0, minutes ?? 0);
  }

  toText(): string {
    return `${twoDigits(this.hours)}:${twoDigits(this.minutes)}`;
  }

  // Less than 0 when this is earlier than the other, 0 when they're the same time, and
  // more than 0 when it's later.
  compareTo(other: TimeOfDay): number {
    return this.#minutesSinceMidnight() - other.#minutesSinceMidnight();
  }

  equals(other: TimeOfDay): boolean {
    return this.compareTo(other) === 0;
  }

  #minutesSinceMidnight(): number {
    return this.hours * MINUTES_IN_HOUR + this.minutes;
  }
}

export const EIGHT_A_M = new TimeOfDay(8, 0);

function isWholeBelow(value: number, limit: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < limit;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
