import type { Place } from "../domain/place.js";
import type { PlaceStore } from "./place-repository.js";
import type { Connectable, Queryable } from "./queryable.js";
import { inTransaction } from "./transaction.js";

export interface PlaceWriterOptions {
  pool: Connectable;
  makeStore: (connection: Queryable) => PlaceStore;
}

// Saves places from a search or lookup (persistence design, section 8.6). It isn't a
// write: it takes no row lock, doesn't load the plan, and runs no finish (section 3). So
// a Google call never runs while a trip's row is locked.
export class PlaceWriter {
  constructor(private readonly options: PlaceWriterOptions) {}

  // Returns the stored places in the order given. A place the trip already had comes
  // back as it was first stored, so a search can't change its facts or its ID.
  save(tripId: string, places: readonly Place[]): Promise<Place[]> {
    return inTransaction(this.options.pool, (client) =>
      this.options.makeStore(client).addPlaces(tripId, places),
    );
  }
}
