import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";

// A place the user turned down for the whole trip, with their reason, such as "too
// kitschy for us" (domain model 3.4). It never changes.
export class RejectedPlace {
  readonly place: Place;
  readonly reason: string;

  constructor(fields: { place: Place; reason: string }) {
    if (fields.reason.trim() === "") {
      throw new RuleError("A rejected place needs the user's reason.");
    }
    this.place = fields.place;
    this.reason = fields.reason;
  }
}
