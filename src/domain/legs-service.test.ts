import { describe, expect, it } from "vitest";

import {
  at,
  lodgeAt,
  OWNER,
  PLANNED_AT,
  placeNamed,
  planningFor,
} from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { exampleWaypoint } from "./place.fake.js";
import {
  addNepentheLunch,
  BIG_SUR,
  changeOf,
  FIRST_AWAKENINGS,
  forgetCalls,
  legsFor,
  MONTEREY,
  namesOf,
  NEPENTHE,
  SAN_LUIS_OBISPO,
  sanFranciscoDay2,
  settledMoab,
} from "./legs.fake.js";
import { newTrip } from "./trip.js";

describe("LegsService.updateLegs: which days have a leg", () => {
  it("adds a leg to each day that moves, through its selected stops, and remembers what it was routed for", async () => {
    const { itinerary, day2, legs, finder } = sanFranciscoDay2();
    const changes = await legs.updateLegs(itinerary);
    expect(changes.map((change) => change.day)).toEqual(itinerary.days);
    const day2Change = changeOf(changes, day2);
    expect(day2Change.oldLeg).toBeNull();
    const leg = present(day2Change.newLeg);
    expect(day2.leg).toBe(leg);
    expect(leg.segmentDriveTimesInMinutes).toEqual([30, 30]);
    expect(leg.routedFromPlace).toBe(MONTEREY);
    expect(leg.routedToPlace).toBe(SAN_LUIS_OBISPO);
    expect(leg.routedStopPlaces).toEqual([FIRST_AWAKENINGS]);
    expect(leg.routedWaypoints).toEqual([]);
    expect(leg.stopsInBestOrder).toEqual([]);
    expect(leg.timeSavedInMinutes).toBe(0);
    // One stop, so no stop-order check.
    expect(finder.bestOrders).toEqual([]);
  });

  it("gives no leg until both ends are known: a new trip's only day has none", async () => {
    const planning = planningFor(newTrip(OWNER, PLANNED_AT));
    const { legs, finder } = legsFor(planning);
    expect(await legs.updateLegs(planning.itinerary)).toEqual([]);
    expect(planning.itinerary.lastDay.leg).toBeNull();
    expect(finder.callCount).toBe(0);
  });

  it("gives a day that stays put a leg while a stop on it is selected, starting and ending at the stay", async () => {
    const { itinerary, services, moab, legs, finder } = await settledMoab();
    const day3 = present(moab.days[2]);
    expect(day3.leg).toBeNull();
    services.days.setRestDay(itinerary, day3, false);
    const changes = await legs.updateLegs(itinerary);
    const leg = present(changeOf(changes, day3).newLeg);
    const moabHotel = present(moab.lodging);
    expect([leg.routedFromPlace, leg.routedToPlace]).toEqual([
      moabHotel,
      moabHotel,
    ]);
    expect(namesOf(finder.routes[0])).toEqual(["The Spoke on Center"]);
  });

  it("removes the leg, with its waypoints, from a day marked a rest day, and hands the change back", async () => {
    const { itinerary, services, moab, legs, finder } = await settledMoab();
    const day2 = present(moab.days[1]);
    const oldLeg = present(day2.leg);
    day2.setWaypoints([exampleWaypoint(placeNamed("Arches viewpoint"))]);
    day2.stops.forEach((stop, index) => {
      services.stops.setStopTime(
        itinerary,
        stop,
        stop.setTime ?? at(`1${String(index)}:00`),
      );
    });
    services.days.setRestDay(itinerary, day2, true);
    const changes = await legs.updateLegs(itinerary);
    expect(changes).toEqual([{ day: day2, oldLeg, newLeg: null }]);
    expect(day2.leg).toBeNull();
    expect(day2.waypoints).toEqual([]);
    expect(finder.callCount).toBe(0);
  });

  it("removes the leg from a day that stays put once none of its stops is selected", async () => {
    const { itinerary, services, moab, legs } = await settledMoab();
    const day2 = present(moab.days[1]);
    const oldLeg = day2.leg;
    services.stops.removeStops(itinerary, day2.stops);
    const changes = await legs.updateLegs(itinerary);
    expect(changes).toEqual([{ day: day2, oldLeg, newLeg: null }]);
  });
});

describe("LegsService.updateLegs: re-routing", () => {
  it("leaves every leg alone when nothing it was routed for changed, such as a stop's set time", async () => {
    const { itinerary, services, stops, legs, finder } = await settledMoab();
    services.stops.setStopTime(itinerary, stops.milts, at("12:30"));
    expect(await legs.updateLegs(itinerary)).toEqual([]);
    expect(finder.callCount).toBe(0);
  });

  it("re-routes Days 1, 2, and 4 when the Moab hotel changes, since they start or end there", async () => {
    const moabTrip = await settledMoab();
    const { itinerary, moab, torrey, legs } = moabTrip;
    const [day1, day2] = moab.days;
    const oldLegs = [day1?.leg, day2?.leg, torrey.days[0]?.leg];
    lodgeAt(moabTrip, moab, placeNamed("Other Moab hotel"));
    const changes = await legs.updateLegs(itinerary);
    expect(changes.map((change) => change.day)).toEqual([
      day1,
      day2,
      torrey.days[0],
    ]);
    expect(changes.map((change) => change.oldLeg)).toEqual(oldLegs);
    expect(day1?.leg?.routedToPlace.name).toBe("Other Moab hotel");
    expect(day2?.leg?.routedFromPlace.name).toBe("Other Moab hotel");
  });

  it("re-routes a day whose selected stops change, and keeps its waypoints", async () => {
    const planning = sanFranciscoDay2();
    const { itinerary, day2, legs } = planning;
    await legs.updateLegs(itinerary);
    day2.setWaypoints([exampleWaypoint(BIG_SUR)]);
    await legs.updateLegs(itinerary);
    addNepentheLunch(planning, "afterBreakfast");
    const changes = await legs.updateLegs(itinerary);
    expect(changes.map((change) => change.day)).toEqual([day2]);
    const leg = present(day2.leg);
    expect(leg.routedStopPlaces).toEqual([FIRST_AWAKENINGS, NEPENTHE]);
    expect(leg.routedWaypoints).toEqual([BIG_SUR]);
    expect(day2.waypoints.map((waypoint) => waypoint.place)).toEqual([BIG_SUR]);
  });

  it("refuses when a call to Google fails, and changes no leg", async () => {
    const moabTrip = await settledMoab();
    const { itinerary, moab, legs, finder } = moabTrip;
    const day1 = present(moab.days[0]);
    const before = day1.leg;
    lodgeAt(moabTrip, moab, placeNamed("Other Moab hotel"));
    finder.failure = new Error("Google Routes didn't answer.");
    await expect(legs.updateLegs(itinerary)).rejects.toThrow(
      "Google Routes didn't answer.",
    );
    expect(day1.leg).toBe(before);
  });
});

describe("LegsService.updateLegs: waypoints", () => {
  it("on San Francisco Day 2, with only First Awakenings selected, puts the Big Sur waypoint between First Awakenings and San Luis Obispo", async () => {
    const { itinerary, day2, legs, finder } = sanFranciscoDay2();
    await legs.updateLegs(itinerary);
    day2.setWaypoints([exampleWaypoint(BIG_SUR)]);
    forgetCalls(finder);
    await legs.updateLegs(itinerary);
    expect(finder.routes).toHaveLength(1);
    expect(namesOf(finder.routes[0])).toEqual([
      "First Awakenings",
      "Big Sur village (pass through)",
    ]);
    // A waypoint doesn't split a segment.
    expect(day2.leg?.segmentDriveTimesInMinutes).toEqual([30, 30]);
  });

  it("skips a waypoint that's the same place as the leg's start or end, but remembers it", async () => {
    const { itinerary, day2, legs, finder } = sanFranciscoDay2();
    await legs.updateLegs(itinerary);
    day2.setWaypoints([
      exampleWaypoint(MONTEREY),
      exampleWaypoint(BIG_SUR),
      exampleWaypoint(SAN_LUIS_OBISPO),
    ]);
    forgetCalls(finder);
    await legs.updateLegs(itinerary);
    expect(namesOf(finder.routes[0])).toEqual([
      "First Awakenings",
      "Big Sur village (pass through)",
    ]);
    expect(day2.leg?.routedWaypoints).toEqual([
      MONTEREY,
      BIG_SUR,
      SAN_LUIS_OBISPO,
    ]);
  });
});
