import { Day } from "./day.js";

// The trip's last day, which ends at the end place with no night (domain model 3.6).
// It's its own kind so that it can't be a rest day, and only the itinerary holds it.
export class LastDay extends Day {
  readonly kind = "lastDay" as const;
}
