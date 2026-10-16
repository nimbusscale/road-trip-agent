import { RuleError } from "./rule-error.js";
import { WEEKDAYS, type Weekday } from "./weekday.js";

// "YYYY-MM-DD", such as "2027-05-13".
export const CALENDAR_DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MILLISECONDS_IN_DAY = 86_400_000;

// A calendar date, with no time (domain model section 1, the `date` type), such as the
// itinerary's startDate. It's stored as "YYYY-MM-DD" text, like a time of day is stored
// as text (persistence design, section 2).
export class CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  // month is 1 for January, as people count.
  constructor(year: number, month: number, day: number) {
    const asUtc = new Date(Date.UTC(year, month - 1, day));
    const isRealDate =
      Number.isInteger(year) &&
      year >= 1000 &&
      asUtc.getUTCFullYear() === year &&
      asUtc.getUTCMonth() === month - 1 &&
      asUtc.getUTCDate() === day;
    if (!isRealDate) {
      throw new RuleError(
        `${String(year)}-${String(month)}-${String(day)} isn't a real date.`,
      );
    }
    this.year = year;
    this.month = month;
    this.day = day;
  }

  static fromText(text: string): CalendarDate {
    if (!CALENDAR_DATE_TEXT.test(text)) {
      throw new RuleError(
        `A date is written YYYY-MM-DD, such as 2027-05-13. It was given "${text}".`,
      );
    }
    const [year, month, day] = text.split("-").map(Number);
    return new CalendarDate(year ?? 0, month ?? 0, day ?? 0);
  }

  toText(): string {
    return [String(this.year), twoDigits(this.month), twoDigits(this.day)].join(
      "-",
    );
  }

  // Such as "May 2027", for the trip's name (domain model 3.1).
  get monthAndYear(): string {
    return `${MONTH_NAMES[this.month - 1] ?? ""} ${String(this.year)}`;
  }

  // Such as "Sunday, October 10, 2027", the way the coordinator is given today's date
  // (technical spec 5.2). Errors that name a date use it.
  get longText(): string {
    const weekday = this.weekday;
    const weekdayName = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
    const monthName = MONTH_NAMES[this.month - 1] ?? "";
    return `${weekdayName}, ${monthName} ${String(this.day)}, ${String(this.year)}`;
  }

  // The day of the week, which opening hours are given by.
  get weekday(): Weekday {
    return WEEKDAYS[new Date(this.#utcMilliseconds()).getUTCDay()] ?? "sunday";
  }

  plusDays(days: number): CalendarDate {
    const moved = new Date(
      this.#utcMilliseconds() + days * MILLISECONDS_IN_DAY,
    );
    return new CalendarDate(
      moved.getUTCFullYear(),
      moved.getUTCMonth() + 1,
      moved.getUTCDate(),
    );
  }

  // The number of days from the other date to this one: less than 0 when this is
  // earlier, 0 on the same date, and more than 0 when it's later.
  compareTo(other: CalendarDate): number {
    return Math.round(
      (this.#utcMilliseconds() - other.#utcMilliseconds()) /
        MILLISECONDS_IN_DAY,
    );
  }

  equals(other: CalendarDate): boolean {
    return this.compareTo(other) === 0;
  }

  #utcMilliseconds(): number {
    return Date.UTC(this.year, this.month - 1, this.day);
  }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
