import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";

// A place a day's drive passes through without stopping, with why the coordinator set
// it, such as "steer onto US-1" (domain model 3.6). The reason tells a later session,
// and anyone reading the itinerary, which waypoints are still needed. It never changes.
export class Waypoint {
  readonly place: Place;
  readonly reason: string;

  constructor(fields: { place: Place; reason: string }) {
    if (fields.reason.trim() === "") {
      throw new RuleError(
        `A waypoint needs a reason, such as "steer onto US-1". The one at ${fields.place.id} has none.`,
      );
    }
    this.place = fields.place;
    this.reason = fields.reason;
  }
}
