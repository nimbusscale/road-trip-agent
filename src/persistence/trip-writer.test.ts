import { describe, expect, expectTypeOf, it } from "vitest";

import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { RuleError } from "../domain/rule-error.js";
import type { Trip } from "../domain/trip.js";
import type { EditableTrip } from "./editable-trip.js";
import { TripBusyError } from "./trip-errors.js";
import { TripReader } from "./trip-reader.js";
import type { TripStore } from "./trip-repository.js";
import { FakePool, FakeTripStore } from "./trip-store.fake.js";
import {
  BUSY_PAUSE_MILLISECONDS,
  TripWriter,
  type Clock,
} from "./trip-writer.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };
const STARTED = new Date("2026-10-15T09:00:00Z");
const WRITTEN = new Date("2026-10-15T10:00:00Z");

class FakeClock implements Clock {
  readonly pauses: number[] = [];
  current = STARTED;

  now(): Date {
    return this.current;
  }

  pause(milliseconds: number): Promise<void> {
    this.pauses.push(milliseconds);
    return Promise.resolve();
  }
}

function setUp(): {
  writer: TripWriter;
  reader: TripReader;
  store: FakeTripStore;
  pool: FakePool;
  clock: FakeClock;
} {
  const store = new FakeTripStore();
  const pool = new FakePool();
  const clock = new FakeClock();
  const storeFor = (): TripStore => store;
  const settings = loadSettings(SETTINGS_PATH);
  const writer = new TripWriter({ pool, storeFor, settings, clock });
  return { writer, reader: new TripReader(pool, storeFor), store, pool, clock };
}

describe("TripWriter.startTrip", () => {
  it("adds a new trip, with an empty brief and only a last day", async () => {
    const { writer, reader } = setUp();
    const started = await writer.startTrip(OWNER);
    const trip = await reader.read(started.id);
    expect(trip.id).toMatch(/^trip_/);
    expect(trip.owner).toEqual(OWNER);
    expect(trip.tripBrief.id).toMatch(/^brief_/);
    expect(trip.tripBrief.focus).toBeNull();
    expect(trip.tripBrief.usualStartTime.toText()).toBe("08:00");
    expect(trip.itinerary.id).toMatch(/^itin_/);
    expect(trip.itinerary.lastDay.id).toMatch(/^day_/);
    expect(trip.lastUpdatedDateTime).toEqual(STARTED);
    expect(trip.name).toBeNull();
    expect(trip.hasStarted).toBe(false);
  });
});

describe("TripWriter.write", () => {
  it("saves the change, sets last updated, and returns what the change returned", async () => {
    const { writer, reader, pool, clock } = setUp();
    const { id } = await writer.startTrip(OWNER);
    clock.current = WRITTEN;
    const result = await writer.write(id, ({ trip, services }) => {
      trip.tripBrief.focus = "Pacific Coast Highway";
      services.tripBrief.setTripLength(trip.tripBrief, 3);
      return "done";
    });
    expect(result.changeResult).toBe("done");
    const trip = await reader.read(id);
    expect(trip.name).toBe("Pacific Coast Highway");
    expect(trip.tripBrief.tripLengthInDays).toBe(3);
    expect(trip.lastUpdatedDateTime).toEqual(WRITTEN);
    expect(pool.statements.slice(-2)).toEqual(["BEGIN", "COMMIT"]);
  });

  it("saves nothing when the change is refused partway", async () => {
    const { writer, reader, store, pool, clock } = setUp();
    const { id } = await writer.startTrip(OWNER);
    const before = store.rows.get(id);
    clock.current = WRITTEN;
    const write = writer.write(id, ({ trip, services }) => {
      trip.tripBrief.focus = "Texas barbecue";
      services.tripBrief.setTripLength(trip.tripBrief, 15);
    });
    await expect(write).rejects.toThrow(RuleError);
    expect(store.rows.get(id)).toBe(before);
    const trip = await reader.read(id);
    expect(trip.tripBrief.focus).toBeNull();
    expect(trip.lastUpdatedDateTime).toEqual(STARTED);
    expect(pool.statements.slice(-2)).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("tries a busy trip again, after a pause", async () => {
    const { writer, reader, store, clock } = setUp();
    const { id } = await writer.startTrip(OWNER);
    store.loadForWriteErrors.push(new TripBusyError(), new TripBusyError());
    await writer.write(id, ({ trip }) => {
      trip.tripBrief.mustSeesText = "Big Sur";
    });
    expect(clock.pauses).toEqual([
      BUSY_PAUSE_MILLISECONDS,
      BUSY_PAUSE_MILLISECONDS,
    ]);
    expect((await reader.read(id)).tripBrief.mustSeesText).toBe("Big Sur");
  });

  it("passes the error on when the trip is still busy after 3 tries", async () => {
    const { writer, store, clock } = setUp();
    const { id } = await writer.startTrip(OWNER);
    store.loadForWriteErrors.push(
      new TripBusyError(),
      new TripBusyError(),
      new TripBusyError(),
    );
    await expect(writer.write(id, () => "never")).rejects.toThrow(
      "The trip is busy",
    );
    expect(clock.pauses).toHaveLength(2);
  });

  it("doesn't try a refused write again", async () => {
    const { writer, clock } = setUp();
    const { id } = await writer.startTrip(OWNER);
    const refuse = (): never => {
      throw new RuleError("Refused.");
    };
    await expect(writer.write(id, refuse)).rejects.toThrow("Refused.");
    expect(clock.pauses).toEqual([]);
  });
});

describe("TripReader", () => {
  it("lists only the owner's trips", async () => {
    const { writer, reader } = setUp();
    const mine = await writer.startTrip(OWNER);
    await writer.startTrip({ id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" });
    const trips = await reader.listForOwner(OWNER);
    expect(trips.map((trip) => trip.id)).toEqual([mine.id]);
  });

  it("gives a trip whose changes go nowhere", async () => {
    const { writer, reader } = setUp();
    const { id } = await writer.startTrip(OWNER);
    const read = await reader.read(id);
    read.tripBrief.focus = "Changed by mistake";
    expect((await reader.read(id)).tripBrief.focus).toBeNull();
  });

  it("can't hand its trip to save(), and the type checker says so", () => {
    expectTypeOf<Trip>().not.toExtend<EditableTrip>();
    expectTypeOf<TripStore["save"]>()
      .parameter(0)
      .toEqualTypeOf<EditableTrip>();
  });
});
