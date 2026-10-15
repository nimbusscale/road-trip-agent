import type { TripStartedCheck } from "./memory-writer.js";
import type { Queryable } from "./queryable.js";
import { TripRepository, type TripStore } from "./trip-repository.js";

// The check MemoryWriter runs before it changes a trip memory item (persistence design,
// section 8.8). It loads the trip on the writer's connection, without the row lock,
// since memory isn't part of the plan.
export function tripStartedCheckUsing(
  storeFor: (connection: Queryable) => TripStore,
): TripStartedCheck {
  return async (connection, tripId) =>
    (await storeFor(connection).load(tripId)).hasStarted;
}

export const tripStartedCheck = tripStartedCheckUsing(
  (connection) => new TripRepository(connection),
);
