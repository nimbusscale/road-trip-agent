import type { Settings } from "../config/settings.schema.js";
import type { Place } from "../domain/place.js";
import type { Calendar } from "../domain/calendar.js";
import { type LegChange, LegsService } from "../domain/legs-service.js";
import type { RouteFinder } from "../domain/route-finder.js";
import { newTrip, type Trip } from "../domain/trip.js";
import {
  calendarAndServicesFor,
  type TripServices,
} from "../domain/trip-services.js";
import type { User } from "../domain/user.js";
import type { Connectable, Queryable } from "./queryable.js";
import { inTransaction } from "./transaction.js";
import { TripBusyError } from "./trip-errors.js";
import type { TripStore } from "./trip-repository.js";

// A busy trip is tried this many times in all, with this pause between tries, before
// the error goes back. So no agent has to understand the lock (persistence design,
// section 4). With the 5-second lock wait, that's about 17 seconds at most.
export const BUSY_TRIES = 3;
export const BUSY_PAUSE_MILLISECONDS = 1000;

// What a write's change is given (persistence design, section 8.2).
export interface ChangeContext {
  trip: Trip;
  calendar: Calendar;
  services: TripServices;
  // For detour times, which the tool add_stop_candidates works out in its change. The
  // same service updates the legs in the finish (domain model 4.7).
  legs: LegsService;
  // Turns a place ID the change is handed into one of the trip's places, or refuses it
  // (persistence design, section 8.4).
  placeOf: (placeId: string) => Place;
}

export type Change<T> = (context: ChangeContext) => T | Promise<T>;

// What a write hands back (persistence design, section 8.2). Phase 20 adds
// checkComparison.
export interface WriteResult<T> {
  readonly changeResult: T;
  // One for each day whose leg the finish added, re-routed, or removed.
  readonly legChanges: readonly LegChange[];
}

export interface Clock {
  now(): Date;
  pause(milliseconds: number): Promise<void>;
}

export interface TripWriterOptions {
  pool: Connectable;
  storeFor: (connection: Queryable) => TripStore;
  settings: Settings;
  clock: Clock;
  // Google Routes in the app, and a fake in tests.
  routeFinder: RouteFinder;
}

export const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
  pause: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

// Runs everything that saves a trip (persistence design, section 8.2). Each write runs
// in one transaction, so a refusal anywhere saves nothing.
export class TripWriter {
  readonly #options: TripWriterOptions;

  constructor(options: TripWriterOptions) {
    this.#options = options;
  }

  async write<T>(tripId: string, change: Change<T>): Promise<WriteResult<T>> {
    for (let tries = 1; ; tries++) {
      try {
        return await this.#writeOnce(tripId, change);
      } catch (error) {
        if (!(error instanceof TripBusyError) || tries >= BUSY_TRIES) {
          throw error;
        }
        await this.#options.clock.pause(BUSY_PAUSE_MILLISECONDS);
      }
    }
  }

  async startTrip(owner: User): Promise<Trip> {
    const { pool, storeFor, clock } = this.#options;
    const trip = newTrip(owner, clock.now());
    await inTransaction(pool, (client) => storeFor(client).add(trip));
    return trip;
  }

  // The four steps of a write (domain model section 1). The lock is taken at the load,
  // before anything changes, so a busy trip is safe to try again.
  #writeOnce<T>(tripId: string, change: Change<T>): Promise<WriteResult<T>> {
    const { pool, storeFor, settings, clock, routeFinder } = this.#options;
    return inTransaction(pool, async (client) => {
      const store = storeFor(client);
      const editableTrip = await store.loadForWrite(tripId);
      // Before anything changes. The save checks again (persistence design, section 5).
      editableTrip.refuseIfStarted(clock.now());
      const trip = editableTrip.trip;
      const { calendar, services } = calendarAndServicesFor(
        trip,
        settings,
        () => clock.now(),
      );
      const legs = new LegsService({ calendar, routeFinder });
      const changeResult = await change({
        trip,
        calendar,
        services,
        legs,
        placeOf: (placeId) => editableTrip.placeOf(placeId),
      });
      // The finish: legs first, since the checks need the new drive times. Phase 20
      // adds the checks after them. A failed Google call refuses the whole write.
      const legChanges = await legs.updateLegs(trip.itinerary);
      trip.lastUpdatedDateTime = clock.now();
      // The save checks the lock again, which catches a trip that started during the
      // write, at midnight.
      await store.save(editableTrip, clock.now());
      return { changeResult, legChanges };
    });
  }
}
