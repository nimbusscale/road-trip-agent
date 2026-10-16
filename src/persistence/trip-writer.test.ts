import { describe, expect, expectTypeOf, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { exampleAddress, examplePlace } from "../domain/place.fake.js";
import { RuleError } from "../domain/rule-error.js";
import type { Trip } from "../domain/trip.js";
import type { EditableTrip } from "./editable-trip.js";
import { NoSuchPlaceError } from "./place-errors.js";
import type { TripStore } from "./trip-repository.js";
import { TripBusyError, TripStartedError } from "./trip-errors.js";
import type { FakeTripStore } from "./trip-store.fake.js";
import { BUSY_PAUSE_MILLISECONDS } from "./trip-writer.js";
import { setUp, STARTED, WRITTEN } from "./trip-writer.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

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
    expect(trip.hasStarted(STARTED)).toBe(false);
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

describe("TripWriter's started-trip lock", () => {
  // The Moab trip starts October 10, 2027, at Grand Junction, on Mountain time (UTC-6
  // in October).
  const nightBefore = new Date("2027-10-10T05:59:00Z");
  const justAfterMidnight = new Date("2027-10-10T06:00:30Z");
  const startedError = new TripStartedError(new CalendarDate(2027, 10, 10));

  async function storedMoabTrip(store: FakeTripStore): Promise<string> {
    const { trip, places } = exampleMoabTrip(OWNER);
    await store.add(trip);
    store.places.rows.push(
      ...places.map((place) => ({ tripId: trip.id, place })),
    );
    return trip.id;
  }

  it("refuses a write that loads at 11:59 p.m. the night before the start date and saves after midnight", async () => {
    const { writer, store, pool, clock } = setUp();
    const id = await storedMoabTrip(store);
    const before = store.rows.get(id);
    clock.current = nightBefore;
    const write = writer.write(id, ({ trip }) => {
      trip.tripBrief.mealPreferencesText = "Swap the Day 2 dinner";
      clock.current = justAfterMidnight;
    });
    await expect(write).rejects.toThrow(startedError);
    expect(store.rows.get(id)).toBe(before);
    expect(pool.statements.slice(-2)).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("goes by the start date as loaded, which the write may have moved", async () => {
    const { writer, store, clock } = setUp();
    const id = await storedMoabTrip(store);
    const before = store.rows.get(id);
    clock.current = nightBefore;
    const write = writer.write(id, ({ trip, services }) => {
      services.itinerary.setStartDate(
        trip.itinerary,
        new CalendarDate(2027, 10, 20),
      );
      clock.current = justAfterMidnight;
    });
    await expect(write).rejects.toThrow(startedError);
    expect(store.rows.get(id)).toBe(before);
  });

  it("refuses a write to a started trip before its change runs", async () => {
    const { writer, store, clock } = setUp();
    const id = await storedMoabTrip(store);
    clock.current = justAfterMidnight;
    let hasRun = false;
    const write = writer.write(id, () => {
      hasRun = true;
    });
    await expect(write).rejects.toThrow(
      "The trip has started, so it can't be changed. Today is Sunday, October 10, 2027 at its start place, on or after its start date.",
    );
    expect(hasRun).toBe(false);
  });

  it("saves a write that finishes before midnight", async () => {
    const { writer, reader, store, clock } = setUp();
    const id = await storedMoabTrip(store);
    clock.current = nightBefore;
    await writer.write(id, ({ trip }) => {
      trip.tripBrief.mealPreferencesText = "Swap the Day 2 dinner";
    });
    const trip = await reader.read(id);
    expect(trip.tripBrief.mealPreferencesText).toBe("Swap the Day 2 dinner");
  });
});

describe("TripWriter.write with places", () => {
  it("turns a place ID into one of the trip's places, the same object each time", async () => {
    const { writer, store } = setUp();
    const { id } = await writer.startTrip(OWNER);
    const [place] = await store.places.addPlaces(id, [examplePlace()]);
    const placeId = place?.id ?? "";
    const result = await writer.write(id, ({ placeOf }) => ({
      name: placeOf(placeId).name,
      isSameObject: placeOf(placeId) === placeOf(placeId),
    }));
    expect(result.changeResult).toEqual({
      name: "Smitty's Market",
      isSameObject: true,
    });
  });

  it("refuses another trip's place ID, and saves nothing", async () => {
    const { writer, reader, store } = setUp();
    const { id } = await writer.startTrip(OWNER);
    const other = await writer.startTrip(OWNER);
    const [place] = await store.places.addPlaces(other.id, [examplePlace()]);
    const write = writer.write(id, ({ trip, placeOf }) => {
      trip.tripBrief.focus = "Texas barbecue";
      placeOf(place?.id ?? "");
    });
    await expect(write).rejects.toThrow(NoSuchPlaceError);
    expect((await reader.read(id)).tripBrief.focus).toBeNull();
  });

  it("saves a name the write filled in, and only that", async () => {
    const { writer, store } = setUp();
    const { id } = await writer.startTrip(OWNER);
    const [address, smittys] = await store.places.addPlaces(id, [
      exampleAddress(),
      examplePlace(),
    ]);
    await writer.write(id, ({ placeOf }) => {
      placeOf(address?.id ?? "").fillName("Mike's house");
      placeOf(smittys?.id ?? "").fillName("The barbecue place");
    });
    const names = (await store.places.loadForTrip(id)).map(
      (place) => place.name,
    );
    expect(names).toEqual(["Mike's house", "Smitty's Market"]);
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
