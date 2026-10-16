import type { Trip } from "../domain/trip.js";
import type { User } from "../domain/user.js";
import { EditableTrip } from "./editable-trip.js";
import { FakePlaceStore } from "./place-store.fake.js";
import { planSchema } from "./plan.schema.js";
import { planDocumentOf, tripFromRow } from "./plan-document.js";
import type { Connectable, TransactionClient } from "./queryable.js";
import type { TripStore } from "./trip-repository.js";

// Test fakes for Postgres (DEVELOPMENT.md section 5). The store keeps each trip's owner,
// and its plan document as JSON text. So every load builds a new trip, as Postgres would.
export class FakeTripStore implements TripStore {
  readonly rows = new Map<string, { ownerId: string; plan: string }>();
  // Each entry makes one loadForWrite() throw it instead of loading.
  readonly loadForWriteErrors: Error[] = [];
  // The trips' places, loaded with a trip for a write, as TripRepository does.
  readonly places = new FakePlaceStore();

  async loadForWrite(tripId: string): Promise<EditableTrip> {
    const error = this.loadForWriteErrors.shift();
    if (error !== undefined) {
      throw error;
    }
    const trip = await this.load(tripId);
    return new EditableTrip(trip, await this.places.loadForTrip(tripId));
  }

  load(tripId: string): Promise<Trip> {
    const row = this.rows.get(tripId);
    if (row === undefined) {
      return Promise.reject(new Error(`There's no trip ${tripId}.`));
    }
    const plan = planSchema.parse(JSON.parse(row.plan));
    return Promise.resolve(
      tripFromRow({ id: tripId, ownerId: row.ownerId, plan }),
    );
  }

  async listForOwner(owner: User): Promise<Trip[]> {
    const trips = await Promise.all(
      [...this.rows.keys()].map((tripId) => this.load(tripId)),
    );
    return trips.filter((trip) => trip.owner.id === owner.id);
  }

  add(trip: Trip): Promise<void> {
    this.#store(trip);
    return Promise.resolve();
  }

  save(editableTrip: EditableTrip): Promise<void> {
    this.#store(editableTrip.trip);
    return this.places.fillNames(editableTrip.namedPlaces);
  }

  #store(trip: Trip): void {
    this.rows.set(trip.id, {
      ownerId: trip.owner.id,
      plan: JSON.stringify(planDocumentOf(trip)),
    });
  }
}

// Records the statements a transaction sends. The store above does the rest.
export class FakePool implements Connectable, TransactionClient {
  readonly statements: string[] = [];

  connect(): Promise<this> {
    return Promise.resolve(this);
  }

  query(text: string): Promise<{ rows: readonly unknown[] }> {
    this.statements.push(text);
    return Promise.resolve({ rows: [] });
  }

  release(): void {
    // Nothing to give back.
  }
}
