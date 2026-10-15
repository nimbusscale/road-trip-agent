import type { Trip } from "../domain/trip.js";

// A trip loaded for a write, under the row lock (persistence design, section 8.4).
// Only TripRepository.loadForWrite() makes one, and save() takes only this, so a trip
// from a read can never be saved. The object itself holds no lock.
//
// Phase 15 adds placeOf() and unnamedPlaceIds, with the places table. Phase 16 adds
// loadedStartDate and loadedStartPlace, with the itinerary's start date and place.
export class EditableTrip {
  readonly trip: Trip;

  constructor(trip: Trip) {
    this.trip = trip;
  }

  // Worked out from the trip as loaded, since the write may change its start date. The
  // itinerary has no start date yet, so no trip has started. Phase 18 tests the lock.
  hasStarted(): boolean {
    return this.trip.hasStarted;
  }
}
