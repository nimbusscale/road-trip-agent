import type { Itinerary } from "./itinerary.js";
import type { RejectedPlace } from "./rejected-place.js";
import type { Stay } from "./stay.js";
import type { Stop } from "./stop.js";
import { VIA_SERVICE } from "./via-service.js";

// The stops and stays that lost a candidate to a rejection. The tool lists them in its
// reply, since it names only places (domain model 4.3). It isn't stored.
export interface RejectionResult {
  stops: Stop[];
  stays: Stay[];
}

// Records the places the user turned down, and takes them out of every candidate list
// (domain model 4.3). It undoes picks, not the trip's structure: a stay's town, the
// start and end places, and waypoints stay as they are.
export class RejectionsService {
  rejectPlaces(
    itinerary: Itinerary,
    rejections: readonly RejectedPlace[],
  ): RejectionResult {
    rejections.forEach((rejection) => {
      itinerary[VIA_SERVICE].addRejectedPlace(rejection);
    });
    const places = rejections.map((rejection) => rejection.place);
    const isRejected = (candidate: { place: { id: string } }): boolean =>
      places.some((place) => place.id === candidate.place.id);
    // Removing a selected candidate clears the selection, by the stay's or stop's own
    // rule.
    const stays = itinerary.stays.filter((stay) =>
      stay.lodgingCandidates.some(isRejected),
    );
    stays.forEach((stay) => {
      places.forEach((place) => {
        stay[VIA_SERVICE].removeLodgingCandidate(place);
      });
    });
    const stops = itinerary.days
      .flatMap((day) => day.stops)
      .filter((stop) => stop.candidates.some(isRejected));
    stops.forEach((stop) => {
      places.forEach((place) => {
        stop[VIA_SERVICE].removeCandidate(place);
      });
    });
    return { stops, stays };
  }
}
