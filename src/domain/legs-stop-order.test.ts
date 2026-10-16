import { describe, expect, it } from "vitest";

import { lodgeAt, placeNamed } from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import {
  addNepentheLunch,
  BIG_SUR,
  FIRST_AWAKENINGS,
  forgetCalls,
  NEPENTHE,
  sanFranciscoDay2,
  settledMoab,
} from "./legs.fake.js";

// The stop-order check, which LegsService runs when it routes a leg with two or more
// selected stops (technical spec section 8, domain model 4.7).
describe("LegsService.updateLegs: the stop-order check", () => {
  it("with Google's order the same as the day's, gives that order and no time saved, with one more call", async () => {
    const moabTrip = await settledMoab();
    const { itinerary, moab, legs, finder } = moabTrip;
    const day2 = present(moab.days[1]);
    lodgeAt(moabTrip, moab, placeNamed("Other Moab hotel"));
    await legs.updateLegs(itinerary);
    const leg = present(day2.leg);
    expect(leg.stopsInBestOrder).toEqual(day2.stops);
    expect(leg.timeSavedInMinutes).toBe(0);
    // Days 1, 2, and 4 are re-routed, and each has two or more selected stops.
    expect(finder.bestOrders).toHaveLength(3);
    expect(finder.routes).toHaveLength(3);
  });

  it("with a faster order and waypoints, routes the day's own order without waypoints, and gives the time saved", async () => {
    const planning = sanFranciscoDay2();
    const { itinerary, day2, legs, finder } = planning;
    await legs.updateLegs(itinerary);
    day2.setWaypoints([BIG_SUR]);
    // Nepenthe first: the day backtracks to Monterey for breakfast.
    addNepentheLunch(planning, "first");
    forgetCalls(finder);
    // The real run's minutes.
    finder.driveTimesFor = () => [55, 58, 145];
    finder.bestOrderFor = () => ({ order: [1, 0], driveTimes: [7, 59, 136] });
    await legs.updateLegs(itinerary);
    const leg = present(day2.leg);
    expect(leg.stopsInBestOrder).toEqual([day2.stops[1], day2.stops[0]]);
    expect(leg.timeSavedInMinutes).toBe(56);
    expect(finder.bestOrders[0]?.stops).toEqual([NEPENTHE, FIRST_AWAKENINGS]);
    expect(finder.routes).toHaveLength(2);
    expect(
      finder.routes[1]?.through.map((point) => point.isPassThrough),
    ).toEqual([false, false]);
  });

  it("with a faster order and no waypoints, compares with the leg's own drive time, with no more calls", async () => {
    const moabTrip = await settledMoab();
    const { itinerary, moab, legs, finder } = moabTrip;
    const day2 = present(moab.days[1]);
    lodgeAt(moabTrip, moab, placeNamed("Other Moab hotel"));
    // Only Day 2 starts and ends at the same place.
    finder.driveTimesFor = (path) =>
      path.from === path.to ? [22, 9, 27, 5, 13, 13, 5] : null;
    finder.bestOrderFor = (path) =>
      path.from === path.to
        ? { order: [0, 1, 2, 4, 3, 5], driveTimes: [22, 9, 20, 5, 13, 13, 5] }
        : null;
    await legs.updateLegs(itinerary);
    const leg = present(day2.leg);
    expect(leg.timeSavedInMinutes).toBe(7);
    expect(leg.stopsInBestOrder.map((stop) => stop.purpose)).toEqual([
      "a sunrise hike",
      "arches",
      "café",
      "a hike",
      "burgers",
      "dinner out",
    ]);
    expect(finder.routes).toHaveLength(3);
  });

  it("never gives less than 0 minutes saved", async () => {
    const planning = sanFranciscoDay2();
    const { itinerary, day2, legs, finder } = planning;
    addNepentheLunch(planning, "first");
    finder.bestOrderFor = () => ({ order: [1, 0], driveTimes: [40, 40, 40] });
    await legs.updateLegs(itinerary);
    expect(day2.leg?.timeSavedInMinutes).toBe(0);
  });
});
