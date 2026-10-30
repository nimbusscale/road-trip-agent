import { describe, expect, it } from "vitest";

import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { newTrip } from "../domain/trip.js";
import { FAKE_POOL, FakeMemoryStore } from "./fake-memory-store.js";
import { MemoryWriter } from "./memory-writer.js";
import { tripStartedCheckUsing } from "./trip-started-check.js";
import { FakePool, FakeTripStore } from "./trip-store.fake.js";
import { EXAMPLE_SETTINGS } from "../domain/example-trip-parts.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };
const PLANNING = new Date("2026-10-15T09:00:00Z");
// The Moab trip starts October 10, 2027, at Grand Junction, on Mountain time (UTC-6 in
// October): 11:59 p.m. the night before, and just after midnight.
const NIGHT_BEFORE = new Date("2027-10-10T05:59:00Z");
const START_DAY = new Date("2027-10-10T06:00:30Z");

// The Moab example trip, stored with its places.
async function storedMoabTrip(store: FakeTripStore): Promise<string> {
  const { trip, places } = exampleMoabTrip(OWNER);
  await store.add(trip);
  store.places.rows.push(
    ...places.map((place) => ({ tripId: trip.id, place })),
  );
  return trip.id;
}

describe("tripStartedCheckUsing", () => {
  it("says a new trip hasn't started", async () => {
    const store = new FakeTripStore();
    const trip = newTrip(OWNER, PLANNING, EXAMPLE_SETTINGS);
    await store.add(trip);
    const hasTripStarted = tripStartedCheckUsing(
      () => store,
      () => PLANNING,
    );
    await expect(hasTripStarted(new FakePool(), trip.id)).resolves.toBeNull();
  });

  it("gives today's date at the start place once the start date has come", async () => {
    const store = new FakeTripStore();
    const tripId = await storedMoabTrip(store);
    const before = tripStartedCheckUsing(
      () => store,
      () => NIGHT_BEFORE,
    );
    await expect(before(new FakePool(), tripId)).resolves.toBeNull();
    const after = tripStartedCheckUsing(
      () => store,
      () => START_DAY,
    );
    const today = await after(new FakePool(), tripId);
    expect(today?.toText()).toBe("2027-10-10");
  });

  it("passes on the error for a trip that doesn't exist", async () => {
    const hasTripStarted = tripStartedCheckUsing(
      () => new FakeTripStore(),
      () => PLANNING,
    );
    await expect(
      hasTripStarted(new FakePool(), "trip_zzzzzzzz"),
    ).rejects.toThrow("There's no trip trip_zzzzzzzz.");
  });
});

describe("MemoryWriter with the started-trip check", () => {
  function writerAt(
    tripStore: FakeTripStore,
    memoryStore: FakeMemoryStore,
    now: Date,
  ): MemoryWriter {
    return new MemoryWriter({
      pool: FAKE_POOL,
      makeStore: () => memoryStore,
      hasTripStarted: tripStartedCheckUsing(
        () => tripStore,
        () => now,
      ),
      limits: { maximumMemoryItems: 50, maximumMemoryItemCharacters: 300 },
    });
  }

  it("refuses a change to a trip item once the trip has started, and gives the date", async () => {
    const tripStore = new FakeTripStore();
    const memoryStore = new FakeMemoryStore();
    const tripId = await storedMoabTrip(tripStore);
    const item = await writerAt(tripStore, memoryStore, NIGHT_BEFORE).add(
      OWNER.id,
      tripId,
      "skip I-70 this time",
    );
    const writer = writerAt(tripStore, memoryStore, START_DAY);
    const started =
      "This trip has started, so its memory can't change. Today is Sunday, October 10, 2027 at its start place, on or after its start date. User memory still can.";
    await expect(writer.add(OWNER.id, tripId, "new")).rejects.toThrow(started);
    await expect(
      writer.update(OWNER.id, tripId, item.id, "changed"),
    ).rejects.toThrow(started);
    await expect(writer.forget(OWNER.id, tripId, item.id)).rejects.toThrow(
      started,
    );
    expect(memoryStore.rows.map((row) => row.text)).toEqual([
      "skip I-70 this time",
    ]);
    await writer.add(OWNER.id, null, "we skip chains");
    expect(memoryStore.rows).toHaveLength(2);
  });
});
