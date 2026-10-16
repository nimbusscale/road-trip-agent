import type { CandidateOffer } from "./candidate.js";
import type { Itinerary } from "./itinerary.js";
import { RuleError } from "./rule-error.js";

// A candidate isn't a rejected place (domain model 4.4 and 4.6). The whole set is
// refused, so a set is never partly written.
export function refuseRejectedPlaces(
  itinerary: Itinerary,
  offers: readonly CandidateOffer[],
): void {
  const rejected = offers.filter((offer) => itinerary.isRejected(offer.place));
  if (rejected.length > 0) {
    const names = rejected.map((offer) => offer.place.name ?? offer.place.id);
    throw new RuleError(
      `The user rejected ${names.join(", ")}, so it can't be a candidate. No candidates were added.`,
    );
  }
}
