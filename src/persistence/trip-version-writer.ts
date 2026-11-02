import type { Connectable, Queryable } from "./queryable.js";
import {
  type TripVersionSource,
  type TripVersionStore,
  TripVersionRepository,
} from "./trip-version-repository.js";
import { inTransaction } from "./transaction.js";

export interface TripVersionWriterOptions {
  pool: Connectable;
  makeStore: (connection: Queryable) => TripVersionStore;
}

// Saves a trip version at the start of each coordinator turn, so an evaluation can set
// the turn up again (persistence design, section 8.9). It takes no row lock, and doesn't
// load the plan for a write, so it never waits for one.
export class TripVersionWriter {
  constructor(private readonly options: TripVersionWriterOptions) {}

  async save(source: TripVersionSource): Promise<void> {
    await inTransaction(this.options.pool, async (client) => {
      await this.options.makeStore(client).saveFrom(source);
    });
  }
}

// The app's writer, made once when the app or the terminal chat starts.
export function tripVersionWriterFor(pool: Connectable): TripVersionWriter {
  return new TripVersionWriter({
    pool,
    makeStore: (connection) => new TripVersionRepository(connection),
  });
}
