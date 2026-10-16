import type { Place } from "../domain/place.js";
import type { Trip } from "../domain/trip.js";
import { NoSuchPlaceError } from "./place-errors.js";

// A trip loaded for a write, under the row lock (persistence design, section 8.4).
// Only TripRepository.loadForWrite() makes one, and save() takes only this, so a trip
// from a read can never be saved. The object itself holds no lock.
//
// Phase 16 adds loadedStartDate and loadedStartPlace, with the itinerary's start date
// and place.
export class EditableTrip {
  readonly trip: Trip;
  // The places that had no name when loaded. A write can fill a name in, but never
  // change one, so these are the only place rows a save might update (section 8.4).
  readonly unnamedPlaceIds: readonly string[];
  // Every place the trip had when loaded. Each is loaded once per write, so every link
  // to it is the same object.
  readonly #places: ReadonlyMap<string, Place>;

  constructor(trip: Trip, places: readonly Place[]) {
    this.trip = trip;
    this.#places = new Map(places.map((place) => [place.id, place]));
    this.unnamedPlaceIds = Object.freeze(
      places.filter((place) => place.name === null).map((place) => place.id),
    );
  }

  // TripWriter passes this into the write's change, which turns each place ID it's
  // handed into a place. It refuses an ID that isn't one of this trip's places.
  placeOf(placeId: string): Place {
    const place = this.#places.get(placeId);
    if (place === undefined) {
      throw new NoSuchPlaceError(placeId);
    }
    return place;
  }

  // The places whose name the write filled in, for PlaceRepository.fillNames().
  get namedPlaces(): Place[] {
    return this.unnamedPlaceIds
      .map((placeId) => this.placeOf(placeId))
      .filter((place) => place.name !== null);
  }

  // Worked out from the trip as loaded, since the write may change its start date. The
  // itinerary has no start date yet, so no trip has started. Phase 18 tests the lock.
  hasStarted(): boolean {
    return this.trip.hasStarted;
  }
}
