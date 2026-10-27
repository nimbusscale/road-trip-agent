import { describe, expect, it } from "vitest";

import { planningFor } from "../domain/example-trip-parts.fake.js";
import { exampleMoabTrip, present } from "../domain/itinerary.fake.js";
import { planSchema } from "./plan.schema.js";
import { planDocumentOf, tripFromRow } from "./plan-document.js";
import { FakeTripStore } from "./trip-store.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

async function storedExample(): Promise<{
  store: FakeTripStore;
  example: ReturnType<typeof exampleMoabTrip>;
}> {
  const example = exampleMoabTrip(OWNER);
  const store = new FakeTripStore();
  await store.places.addPlaces(example.trip.id, example.places);
  await store.add(example.trip);
  return { store, example };
}

describe("the plan document", () => {
  it("saves a trip with stays, days, stops, candidates, and approvals, and loads it back unchanged", async () => {
    const { store, example } = await storedExample();
    const loaded = await store.load(example.trip.id);
    expect(planDocumentOf(loaded)).toEqual(planDocumentOf(example.trip));
    expect(loaded.name).toBe("Arches and Capitol Reef, October 2027");
    expect(loaded.itinerary.dayCount).toBe(5);
    expect(loaded.itinerary.totalDriveTimeInMinutes).toBe(130);
  });

  it("turns each stored ID back into a link to the loaded object", async () => {
    const { store, example } = await storedExample();
    const editable = await store.loadForWrite(example.trip.id);
    const moab = present(editable.trip.itinerary.stays[0]);
    const [day1, day2] = moab.days.map(present);
    const milts = present(present(day2).stops[1]);
    expect(milts.searchAreaStay).toBe(moab);
    expect(milts.selectedPlace).toBe(
      editable.placeOf(present(example.milts.selectedPlace).id),
    );
    const leg = present(present(day1).leg);
    expect(leg.stopsInBestOrder[0]).toBe(present(day1).stops[1]);
    expect(leg.stopsInBestOrder[1]).toBe(present(day1).stops[0]);
    expect(moab.lodging).toBe(
      editable.placeOf(present(example.moab.lodging).id),
    );
  });

  it("saves a check-in with no search area or place, and loads it back with its visit time", async () => {
    const example = exampleMoabTrip(OWNER);
    const day1 = present(example.moab.days[0]);
    const { itinerary, services } = planningFor(example.trip);
    const checkIn = services.stops.newCheckIn("check in", null);
    services.stops.addStops(itinerary, day1, [checkIn], null);
    checkIn.visitTimeInMinutes = 45;
    const store = new FakeTripStore();
    await store.places.addPlaces(example.trip.id, example.places);
    await store.add(example.trip);
    const loaded = await store.load(example.trip.id);
    expect(planDocumentOf(loaded)).toEqual(planDocumentOf(example.trip));
    const stop = present(present(loaded.itinerary.days[0]).stops[0]);
    expect(stop).toMatchObject({
      kind: "checkIn",
      searchArea: null,
      selectedPlace: null,
      visitTimeInMinutes: 45,
      status: "selected",
    });
  });

  it("keeps the kind of each approval", async () => {
    const { store, example } = await storedExample();
    const itinerary = (await store.load(example.trip.id)).itinerary;
    const [moab, torrey] = itinerary.stays.map(present);
    const [, day2, day3] = present(moab).days.map(present);
    const milts = present(present(day2).stops[1]);
    expect(milts.approvals.map((each) => each.kind)).toEqual(["openingHours"]);
    expect(present(torrey).days[0]?.approvals[0]?.kind).toBe("driveHours");
    expect(itinerary.lastDay.approvals[0]?.kind).toBe("routeType");
    expect(present(day3).isRestDay).toBe(true);
  });

  it("refuses a plan that links to a place the trip doesn't have", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const plan = planSchema.parse(planDocumentOf(trip));
    const row = { id: trip.id, ownerId: OWNER.id, plan };
    expect(() => tripFromRow(row, places.slice(1))).toThrow(
      "links to a place the trip doesn't have",
    );
  });

  it("refuses a stored plan that breaks an object's rule", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const document = planDocumentOf(trip);
    const [moab] = document.itinerary.stays;
    const broken = {
      ...document,
      itinerary: {
        ...document.itinerary,
        stays: [{ ...moab, days: [] }],
      },
    };
    const plan = planSchema.parse(broken);
    expect(() =>
      tripFromRow({ id: trip.id, ownerId: OWNER.id, plan }, places),
    ).toThrow("A stay holds at least one day.");
  });
});
