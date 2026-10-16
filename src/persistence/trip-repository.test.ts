import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { RuleError } from "../domain/rule-error.js";
import { TimeOfDay } from "../domain/time-of-day.js";
import { newTrip } from "../domain/trip.js";
import { EditableTrip } from "./editable-trip.js";
import { planDocumentOf } from "./plan-document.js";
import type { Queryable } from "./queryable.js";
import {
  TripBusyError,
  TripNotFoundError,
  TripStartedError,
} from "./trip-errors.js";
import { LOCK_WAIT, TripRepository } from "./trip-repository.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };
// The column's name, as pg gives it back. Only *.schema.ts files spell out snake_case.
const OWNER_ID_COLUMN = "owner_id";

// A row as pg gives it back: the jsonb column is already an object.
function pgRow(tripId: string, plan: unknown): unknown {
  return { id: tripId, [OWNER_ID_COLUMN]: OWNER.id, plan };
}

// Answers every SELECT from trips with the rows given, or fails it with the error given.
// A trip's places come back empty.
class FakeConnection implements Queryable {
  readonly queries: { text: string; values: readonly unknown[] }[] = [];

  constructor(
    private readonly rows: readonly unknown[],
    private readonly selectError?: Error,
  ) {}

  query(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: readonly unknown[] }> {
    this.queries.push({ text, values });
    const isTripSelect =
      text.startsWith("SELECT") && text.includes("FROM trips");
    if (isTripSelect && this.selectError !== undefined) {
      return Promise.reject(this.selectError);
    }
    return Promise.resolve({ rows: isTripSelect ? this.rows : [] });
  }
}

function storedRow(): { row: unknown; tripId: string } {
  const trip = newTrip(OWNER, new Date("2026-10-15T09:00:00Z"));
  trip.tripBrief.focus = "Pacific Coast Highway";
  return { row: pgRow(trip.id, planDocumentOf(trip)), tripId: trip.id };
}

describe("TripRepository", () => {
  it("loads a trip for a write under the row lock, waiting a set time", async () => {
    const { row, tripId } = storedRow();
    const connection = new FakeConnection([row]);
    const editable = await new TripRepository(connection).loadForWrite(tripId);
    expect(editable.trip.name).toBe("Pacific Coast Highway");
    expect(connection.queries[0]?.values).toEqual([LOCK_WAIT]);
    expect(connection.queries[1]?.text).toMatch(/WHERE id = \$1 FOR UPDATE$/);
    expect(connection.queries[1]?.values).toEqual([tripId]);
  });

  it("loads the trip's places with it for a write, on the same connection", async () => {
    const { row, tripId } = storedRow();
    const connection = new FakeConnection([row]);
    await new TripRepository(connection).loadForWrite(tripId);
    const placesQuery = connection.queries[2];
    expect(placesQuery?.text).toMatch(/FROM places WHERE trip_id = \$1$/);
    expect(placesQuery?.values).toEqual([tripId]);
  });

  it("loads the trip's places with a read too, and the home screen's list", async () => {
    const { row, tripId } = storedRow();
    const connection = new FakeConnection([row]);
    const repository = new TripRepository(connection);
    await repository.load(tripId);
    expect(connection.queries[1]?.text).toMatch(
      /FROM places WHERE trip_id = \$1$/,
    );
    expect(connection.queries[1]?.values).toEqual([tripId]);
    const trips = await repository.listForOwner(OWNER);
    expect(trips.map((trip) => trip.id)).toEqual([tripId]);
    expect(connection.queries.at(-1)?.values).toEqual([tripId]);
  });

  it("calls the trip busy when the lock wait runs out", async () => {
    const lockTimeout = Object.assign(new Error("lock timeout"), {
      code: "55P03",
    });
    const repository = new TripRepository(new FakeConnection([], lockTimeout));
    await expect(repository.loadForWrite("trip_k7m2x9qa")).rejects.toThrow(
      TripBusyError,
    );
  });

  it("refuses a trip ID that doesn't exist", async () => {
    const repository = new TripRepository(new FakeConnection([]));
    await expect(repository.load("trip_k7m2x9qa")).rejects.toThrow(
      TripNotFoundError,
    );
  });

  it("refuses a stored plan that isn't a plan document", async () => {
    const { tripId } = storedRow();
    const bad = pgRow(tripId, { tripBrief: {} });
    const repository = new TripRepository(new FakeConnection([bad]));
    await expect(repository.load(tripId)).rejects.toThrow(ZodError);
  });

  it("parses a stored time of day, and refuses one that isn't HH:MM", async () => {
    const { tripId } = storedRow();
    const plan = planDocumentOf(newTrip(OWNER, new Date()));
    plan.tripBrief.usualStartTime = "13:00";
    const good = new TripRepository(new FakeConnection([pgRow(tripId, plan)]));
    const trip = await good.load(tripId);
    expect(trip.tripBrief.usualStartTime.equals(new TimeOfDay(13, 0))).toBe(
      true,
    );
    plan.tripBrief.usualStartTime = "1 p.m.";
    const bad = new TripRepository(new FakeConnection([pgRow(tripId, plan)]));
    await expect(bad.load(tripId)).rejects.toThrow(ZodError);
  });

  it("refuses a stored plan that breaks an object's rule", async () => {
    const { tripId } = storedRow();
    const trip = newTrip(OWNER, new Date());
    const plan = planDocumentOf(trip);
    plan.tripBrief.tripLengthInDays = 0;
    const repository = new TripRepository(
      new FakeConnection([pgRow(tripId, plan)]),
    );
    await expect(repository.load(tripId)).rejects.toThrow(RuleError);
  });

  it("saves the plan as a parameter, never in the SQL text", async () => {
    const { row, tripId } = storedRow();
    const connection = new FakeConnection([row]);
    const repository = new TripRepository(connection);
    const editable = await repository.loadForWrite(tripId);
    await repository.save(editable, new Date());
    const update = connection.queries.at(-1);
    expect(update?.text).toBe("UPDATE trips SET plan = $2 WHERE id = $1");
    expect(update?.values[0]).toBe(tripId);
    expect(JSON.parse(String(update?.values[1]))).toEqual(
      planDocumentOf(editable.trip),
    );
  });

  it("refuses to save a trip that has started, and sends nothing", async () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const editable = new EditableTrip(trip, places);
    const connection = new FakeConnection([]);
    const repository = new TripRepository(connection);
    // Just after midnight on October 10, 2027, the start date, in Grand Junction.
    const save = repository.save(editable, new Date("2027-10-10T06:00:30Z"));
    await expect(save).rejects.toThrow(TripStartedError);
    expect(connection.queries).toEqual([]);
  });
});
