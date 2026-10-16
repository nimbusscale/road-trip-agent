import { startedToday } from "../domain/today.js";
import type { TripStartedCheck } from "./memory-writer.js";
import type { Queryable } from "./queryable.js";
import { TripRepository, type TripStore } from "./trip-repository.js";

// The check MemoryWriter runs before it changes a trip memory item (persistence design,
// section 8.8). It loads the trip on the writer's connection, without the row lock,
// since memory isn't part of the plan. `now` gives the current moment: the system
// clock in the app, and a fixed time in a test.
export function tripStartedCheckUsing(
  storeFor: (connection: Queryable) => TripStore,
  now: () => Date,
): TripStartedCheck {
  return async (connection, tripId) => {
    const { itinerary } = await storeFor(connection).load(tripId);
    return startedToday(itinerary.startDate, itinerary.startPlace, now());
  };
}

export const tripStartedCheck = tripStartedCheckUsing(
  (connection) => new TripRepository(connection),
  () => new Date(),
);
