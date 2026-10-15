import { describe, expect, it } from "vitest";

import { newTrip } from "../domain/trip.js";
import { tripStartedCheckUsing } from "./trip-started-check.js";
import { FakePool, FakeTripStore } from "./trip-store.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// A started trip can't be made until the itinerary has a start date. Phase 18 tests
// the refusal, as it does for TripWriter.
describe("tripStartedCheckUsing", () => {
  it("says a new trip hasn't started", async () => {
    const store = new FakeTripStore();
    const trip = newTrip(OWNER, new Date("2026-10-15T09:00:00Z"));
    await store.add(trip);
    const hasTripStarted = tripStartedCheckUsing(() => store);
    await expect(hasTripStarted(new FakePool(), trip.id)).resolves.toBe(false);
  });

  it("passes on the error for a trip that doesn't exist", async () => {
    const hasTripStarted = tripStartedCheckUsing(() => new FakeTripStore());
    await expect(
      hasTripStarted(new FakePool(), "trip_zzzzzzzz"),
    ).rejects.toThrow("There's no trip trip_zzzzzzzz.");
  });
});
