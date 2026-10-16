import type { Place } from "../domain/place.js";
import { NoSuchPlaceError } from "./place-errors.js";
import type { PlaceStore } from "./place-repository.js";
import type { Queryable } from "./queryable.js";

export interface PlaceReaderOptions {
  pool: Queryable;
  makeStore: (connection: Queryable) => PlaceStore;
}

// Reads one place without loading the trip (persistence design, section 8.6). The tool
// read_place uses it.
export class PlaceReader {
  constructor(private readonly options: PlaceReaderOptions) {}

  // Takes the trip too, so a place from another trip is refused like one that doesn't
  // exist (domain model 3.10).
  async get(tripId: string, placeId: string): Promise<Place> {
    const store = this.options.makeStore(this.options.pool);
    const place = await store.get(tripId, placeId);
    if (place === undefined) {
      throw new NoSuchPlaceError(placeId);
    }
    return place;
  }
}
