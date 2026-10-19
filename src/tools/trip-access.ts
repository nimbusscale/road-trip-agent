import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { RoutesClient } from "../google/routes-client.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import { TripReader } from "../persistence/trip-reader.js";
import { TripRepository } from "../persistence/trip-repository.js";
import { SYSTEM_CLOCK, TripWriter } from "../persistence/trip-writer.js";
import type { TripSession } from "./trip-session.js";

export interface TripAccessGiven {
  env: Env;
  pool: Connectable & Queryable;
  settings: Settings;
}

// The app's writer and reader for trips, made once when it starts and shared by every
// session's trip server. Every write updates the legs, so the writer routes them with
// Google Routes (domain model 4.7).
export function tripAccessFor(
  given: TripAccessGiven,
): Omit<TripSession, "tripId"> {
  const { env, pool, settings } = given;
  const storeFor = (connection: Queryable): TripRepository =>
    new TripRepository(connection);
  return {
    writer: new TripWriter({
      pool,
      storeFor,
      settings,
      clock: SYSTEM_CLOCK,
      routeFinder: new RoutesClient({ apiKey: env.googleMapsServerKey, fetch }),
    }),
    reader: new TripReader(pool, storeFor),
  };
}
