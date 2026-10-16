import type { CalendarDate } from "../domain/calendar-date.js";
import { RuleError } from "../domain/rule-error.js";

// Another write held the trip's row lock for longer than a write waits (persistence
// design, section 4). TripWriter tries again a few times before passing it on.
export class TripBusyError extends Error {
  override name = "TripBusyError";

  constructor() {
    super(
      "The trip is busy with another change. Nothing was saved. Try again in a moment.",
    );
  }
}

// Persistence holds the started-trip lock (domain model section 1). The message gives
// the date it used, today's date at the start place, so it matches the date the
// coordinator was given (technical spec section 8).
export class TripStartedError extends RuleError {
  override name = "TripStartedError";

  constructor(today: CalendarDate) {
    super(
      `The trip has started, so it can't be changed. Today is ${today.longText} at its start place, on or after its start date.`,
    );
  }
}

export class TripNotFoundError extends Error {
  override name = "TripNotFoundError";

  constructor(tripId: string) {
    super(`There's no trip ${tripId}.`);
  }
}
