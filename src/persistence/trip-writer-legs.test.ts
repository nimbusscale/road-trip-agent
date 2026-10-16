import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { examplePlace } from "../domain/place.fake.js";
import { GoogleRoutesError } from "../google/routes-client.js";
import type { ChangeContext } from "./trip-writer.js";
import { setUp, WRITTEN } from "./trip-writer.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// A new trip with a start place and an end place among its places, not yet set.
async function newTripWithEnds(): Promise<
  ReturnType<typeof setUp> & { id: string; ends: [string, string] }
> {
  const fixture = setUp();
  const { id } = await fixture.writer.startTrip(OWNER);
  const [start, end] = await fixture.store.places.addPlaces(id, [
    examplePlace({ name: "San Francisco", googlePlaceId: "google-sf" }),
    examplePlace({ name: "Mike's house", googlePlaceId: "google-la" }),
  ]);
  return { ...fixture, id, ends: [start?.id ?? "", end?.id ?? ""] };
}

// Sets the ends and the start date, so the last day has both ends and gets a leg.
function setEnds(ends: [string, string]) {
  return ({ trip, services, placeOf }: ChangeContext): void => {
    services.itinerary.setStartPlace(trip.itinerary, placeOf(ends[0]));
    trip.itinerary.endPlace = placeOf(ends[1]);
    services.itinerary.setStartDate(
      trip.itinerary,
      new CalendarDate(2027, 5, 13),
    );
  };
}

describe("TripWriter.write's legs", () => {
  it("routes the legs in the finish, saves them, and hands back the leg changes", async () => {
    const { writer, reader, routeFinder, id, ends } = await newTripWithEnds();
    const result = await writer.write(id, "coordinator", setEnds(ends));
    expect(result.legChanges).toHaveLength(1);
    const [change] = result.legChanges;
    expect(change?.oldLeg).toBeNull();
    expect(change?.newLeg?.driveTimeInMinutes).toBe(30);
    const leg = (await reader.read(id)).itinerary.lastDay.leg;
    expect(leg?.segmentDriveTimesInMinutes).toEqual([30]);
    expect(leg?.routedFromPlace.id).toBe(ends[0]);
    expect(routeFinder.callCount).toBe(1);
  });

  it("hands back no leg changes, and calls Google for nothing, when no leg needs routing", async () => {
    const { writer, routeFinder, id, ends } = await newTripWithEnds();
    await writer.write(id, "coordinator", setEnds(ends));
    const result = await writer.write(id, "coordinator", ({ trip }) => {
      trip.tripBrief.focus = "Pacific Coast Highway";
    });
    expect(result.legChanges).toEqual([]);
    expect(routeFinder.callCount).toBe(1);
  });

  it("refuses the whole write when a Google call fails, and saves nothing", async () => {
    const { writer, reader, store, pool, clock, routeFinder, id, ends } =
      await newTripWithEnds();
    const before = store.rows.get(id);
    clock.current = WRITTEN;
    routeFinder.failure = new GoogleRoutesError(
      "Google Routes couldn't be reached. Try again.",
    );
    await expect(
      writer.write(id, "coordinator", setEnds(ends)),
    ).rejects.toThrow("Google Routes couldn't be reached. Try again.");
    expect(store.rows.get(id)).toBe(before);
    expect(pool.statements.slice(-2)).toEqual(["BEGIN", "ROLLBACK"]);
    const trip = await reader.read(id);
    expect(trip.itinerary.startPlace).toBeNull();
    expect(trip.lastUpdatedDateTime).not.toEqual(WRITTEN);
  });

  it("gives the change the trip's LegsService, for detour times", async () => {
    const { writer, id } = await newTripWithEnds();
    const result = await writer.write(
      id,
      "worker",
      ({ legs }) => typeof legs.detourTimesOf,
    );
    expect(result.changeResult).toBe("function");
  });
});
