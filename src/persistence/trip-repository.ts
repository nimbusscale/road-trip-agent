import { z } from "zod";

import type { Trip } from "../domain/trip.js";
import type { User } from "../domain/user.js";
import { EditableTrip } from "./editable-trip.js";
import { PlaceRepository } from "./place-repository.js";
import { planDocumentOf, tripFromRow } from "./plan-document.js";
import type { Queryable } from "./queryable.js";
import { TripBusyError, TripNotFoundError } from "./trip-errors.js";
import { type TripRow, tripRowSchema } from "./trip-row.schema.js";

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
  // `now` is the time the started-trip lock goes by.
  save(editableTrip: EditableTrip, now: Date): Promise<void>;
}

// Uses PlaceRepository, on the same connection, for the trip's places (section 8.7).
export class TripRepository implements TripStore {
  readonly #places: PlaceRepository;

  constructor(private readonly connection: Queryable) {
    this.#places = new PlaceRepository(connection);
  }

  // Takes the row lock, so it has to run inside a transaction (TripWriter's).
  async loadForWrite(tripId: string): Promise<EditableTrip> {
    // set_config(..., true) lasts until the transaction ends, like SET LOCAL.
    await this.connection.query("SELECT set_config('lock_timeout', $1, true)", [
      LOCK_WAIT,
    ]);
    try {
      // "For no key update" makes a second write wait, but not a place insert's
      // foreign-key check, so saving places from a search never waits (section 4).
      const rows = await this.#select(
        `${SELECT_TRIP} WHERE id = $1 FOR NO KEY UPDATE`,
        [tripId],
      );
      const places = await this.#places.loadForTrip(tripId);
      const trip = tripFromRow(onlyRow(rows, tripId), places);
      return new EditableTrip(trip, places);
    } catch (error) {
      if (lockNotAvailableSchema.safeParse(error).success) {
        throw new TripBusyError();
      }
      throw error;
    }
  }

  // Loads the trip's places too, to turn the plan's place IDs back into links.
  async load(tripId: string): Promise<Trip> {
    const rows = await this.#select(`${SELECT_TRIP} WHERE id = $1`, [tripId]);
    return this.#tripFrom(onlyRow(rows, tripId));
  }

  // For the home screen. Newest change first.
  async listForOwner(owner: User): Promise<Trip[]> {
    const rows = await this.#select(
      `${SELECT_TRIP} WHERE owner_id = $1 ORDER BY plan->>'lastUpdatedDateTime' DESC`,
      [owner.id],
    );
    return Promise.all(rows.map((row) => this.#tripFrom(row)));
  }

  async add(trip: Trip): Promise<void> {
    await this.connection.query(
      "INSERT INTO trips (id, owner_id, plan) VALUES ($1, $2, $3)",
      [trip.id, trip.owner.id, JSON.stringify(planDocumentOf(trip))],
    );
  }

  // Refuses a started trip, so every save is covered by the lock, whoever calls it.
  // TripWriter passes the time from its clock (persistence design, section 5).
  async save(editableTrip: EditableTrip, now: Date): Promise<void> {
    editableTrip.refuseIfStarted(now);
    const trip = editableTrip.trip;
    await this.connection.query("UPDATE trips SET plan = $2 WHERE id = $1", [
      trip.id,
      JSON.stringify(planDocumentOf(trip)),
    ]);
    await this.#places.fillNames(editableTrip.namedPlaces);
  }

  async #select(text: string, values: readonly unknown[]): Promise<TripRow[]> {
    const result = await this.connection.query(text, values);
    return result.rows.map((row) => tripRowSchema.parse(row));
  }

  async #tripFrom(row: TripRow): Promise<Trip> {
    return tripFromRow(row, await this.#places.loadForTrip(row.id));
  }
}

function onlyRow(rows: readonly TripRow[], tripId: string): TripRow {
  const [row] = rows;
  if (row === undefined) {
    throw new TripNotFoundError(tripId);
  }
  return row;
}
