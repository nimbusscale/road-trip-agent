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

// Persistence holds the started-trip lock (domain model section 1). Phase 18 adds the
// date it used to the message, once the itinerary has a start date.
export class TripStartedError extends RuleError {
  override name = "TripStartedError";

  constructor() {
    super("The trip has started, so it can't be changed.");
  }
}

export class TripNotFoundError extends Error {
  override name = "TripNotFoundError";

  constructor(tripId: string) {
    super(`There's no trip ${tripId}.`);
  }
}
