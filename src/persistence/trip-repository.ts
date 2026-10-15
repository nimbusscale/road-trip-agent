import { z } from "zod";

import type { Trip } from "../domain/trip.js";
import type { User } from "../domain/user.js";
import { EditableTrip } from "./editable-trip.js";
import { planDocumentOf, tripFromRow } from "./plan-document.js";
import type { Queryable } from "./queryable.js";
import {
  TripBusyError,
  TripNotFoundError,
  TripStartedError,
} from "./trip-errors.js";
import { tripRowSchema } from "./trip-row.schema.js";

// How long a write waits for the row lock before the trip counts as busy. A write
// holds the lock a few seconds at most (persistence design, section 4).
export const LOCK_WAIT = "5s";

// Postgres's error code for a lock wait that ran out of time.
const LOCK_NOT_AVAILABLE = "55P03";
const lockNotAvailableSchema = z.object({
  code: z.literal(LOCK_NOT_AVAILABLE),
});

const SELECT_TRIP = "SELECT id, owner_id, plan FROM trips";

// Reads and saves trip rows (persistence design, section 8.7).
export interface TripStore {
  loadForWrite(tripId: string): Promise<EditableTrip>;
  load(tripId: string): Promise<Trip>;
  listForOwner(owner: User): Promise<Trip[]>;
  add(trip: Trip): Promise<void>;
  save(editableTrip: EditableTrip): Promise<void>;
}

// Phase 15 adds the places: loading them with the trip, and filling in names at save.
export class TripRepository implements TripStore {
  constructor(private readonly connection: Queryable) {}

  // Takes the row lock, so it has to run inside a transaction (TripWriter's).
  async loadForWrite(tripId: string): Promise<EditableTrip> {
    // set_config(..., true) lasts until the transaction ends, like SET LOCAL.
    await this.connection.query("SELECT set_config('lock_timeout', $1, true)", [
      LOCK_WAIT,
    ]);
    try {
      const rows = await this.#select(
        `${SELECT_TRIP} WHERE id = $1 FOR UPDATE`,
        [tripId],
      );
      return new EditableTrip(onlyTrip(rows, tripId));
    } catch (error) {
      if (lockNotAvailableSchema.safeParse(error).success) {
        throw new TripBusyError();
      }
      throw error;
    }
  }

  async load(tripId: string): Promise<Trip> {
    const rows = await this.#select(`${SELECT_TRIP} WHERE id = $1`, [tripId]);
    return onlyTrip(rows, tripId);
  }

  // For the home screen. Newest change first.
  async listForOwner(owner: User): Promise<Trip[]> {
    return this.#select(
      `${SELECT_TRIP} WHERE owner_id = $1 ORDER BY plan->>'lastUpdatedDateTime' DESC`,
      [owner.id],
    );
  }

  async add(trip: Trip): Promise<void> {
    await this.connection.query(
      "INSERT INTO trips (id, owner_id, plan) VALUES ($1, $2, $3)",
      [trip.id, trip.owner.id, JSON.stringify(planDocumentOf(trip))],
    );
  }

  async save(editableTrip: EditableTrip): Promise<void> {
    if (editableTrip.hasStarted()) {
      throw new TripStartedError();
    }
    const trip = editableTrip.trip;
    await this.connection.query("UPDATE trips SET plan = $2 WHERE id = $1", [
      trip.id,
      JSON.stringify(planDocumentOf(trip)),
    ]);
  }

  async #select(text: string, values: readonly unknown[]): Promise<Trip[]> {
    const result = await this.connection.query(text, values);
    return result.rows.map((row) => tripFromRow(tripRowSchema.parse(row)));
  }
}

function onlyTrip(trips: readonly Trip[], tripId: string): Trip {
  const [trip] = trips;
  if (trip === undefined) {
    throw new TripNotFoundError(tripId);
  }
  return trip;
}
