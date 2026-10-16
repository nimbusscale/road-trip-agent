import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { FakeRouteFinder } from "../domain/route-finder.fake.js";
import { TripReader } from "./trip-reader.js";
import type { TripStore } from "./trip-repository.js";
import { FakePool, FakeTripStore } from "./trip-store.fake.js";
import { type Clock, TripWriter } from "./trip-writer.js";

// A TripWriter for tests, with fakes for Postgres, the clock, and Google Routes
// (DEVELOPMENT.md section 5).

export const STARTED = new Date("2026-10-15T09:00:00Z");
export const WRITTEN = new Date("2026-10-15T10:00:00Z");

export class FakeClock implements Clock {
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

export function setUp(): {
  writer: TripWriter;
  reader: TripReader;
  store: FakeTripStore;
  pool: FakePool;
  clock: FakeClock;
  routeFinder: FakeRouteFinder;
} {
  const store = new FakeTripStore();
  const pool = new FakePool();
  const clock = new FakeClock();
  const routeFinder = new FakeRouteFinder();
  const storeFor = (): TripStore => store;
  const settings = loadSettings(SETTINGS_PATH);
  const writer = new TripWriter({
    pool,
    storeFor,
    settings,
    clock,
    routeFinder,
  });
  return {
    writer,
    reader: new TripReader(pool, storeFor),
    store,
    pool,
    clock,
    routeFinder,
  };
}
