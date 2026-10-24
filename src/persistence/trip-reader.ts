import type { Place } from "../domain/place.js";
import type { Trip } from "../domain/trip.js";
import type { User } from "../domain/user.js";
import type { Queryable } from "./queryable.js";
import type { TripStore } from "./trip-repository.js";

// Reads trips, with no row lock, so it never waits for a write (persistence design,
// section 8.3). A trip from a read can be changed in memory, but never saved.
export class TripReader {
  readonly #store: TripStore;

  constructor(pool: Queryable, storeFor: (connection: Queryable) => TripStore) {
    this.#store = storeFor(pool);
  }

  read(tripId: string): Promise<Trip> {
    return this.#store.load(tripId);
  }

  // Every place the trip has, for the plan's downloads.
  readPlaces(tripId: string): Promise<Place[]> {
    return this.#store.loadPlaces(tripId);
  }

  // For the home screen, which shows each trip's name, dates, and last updated. Each
  // comes from the plan document (persistence design, section 2).
  listForOwner(owner: User): Promise<Trip[]> {
    return this.#store.listForOwner(owner);
  }
}
