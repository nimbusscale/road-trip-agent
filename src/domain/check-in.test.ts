import { describe, expect, it } from "vitest";

import {
  BAR_HARBOR,
  BAR_HARBOR_INN,
  checkInDay,
  COLLEGE,
  LUNCH_PLACE,
  NATICK,
} from "./check-in.fake.js";
import { at, attraction, lodgeAt, pick } from "./example-trip-parts.fake.js";
import { checkerFor, resultOf } from "./feasibility-checker.fake.js";
import { present } from "./itinerary.fake.js";
import { forgetCalls, namesOf, placeAt } from "./legs.fake.js";
import { describeEntry } from "./schedule-entry.fake.js";

// A check-in is a stop at the stay the party sleeps at that night (domain model 3.7).
// Its place is worked out by the calendar, so the day can check in before a later stop.

describe("a day with a check-in before an evening event", () => {
  it("drives to the stay, checks in, drives to the event, waits there, then drives back to the stay", async () => {
    const { itinerary, calendar, legs, finder, day1 } = checkInDay();
    await legs.updateLegs(itinerary);
    expect(namesOf(finder.routes[0])).toEqual([
      "Lunch place",
      "Bar Harbor",
      "College of the Atlantic",
    ]);
    expect(finder.routes[0]?.to).toBe(BAR_HARBOR);
    expect(calendar.scheduleOf(itinerary, day1).map(describeEntry)).toEqual([
      "drive: 10:00 a.m. to 12:45 p.m.",
      "stop Lunch place: 12:45 p.m. to 1:45 p.m.",
      "drive: 1:45 p.m. to 3:57 p.m.",
      "stop check in and freshen up: 3:57 p.m. to 4:27 p.m.",
      "drive: 4:27 p.m. to 4:36 p.m.",
      "freeTime: 4:36 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 8:00 p.m.",
      "drive: 8:00 p.m. to 8:09 p.m.",
    ]);
  });

  it("with a longer visit at the check-in, leaves the hotel just in time for the event, with no free time", async () => {
    const { itinerary, calendar, legs, day1, checkIn } = checkInDay();
    await legs.updateLegs(itinerary);
    checkIn.visitTimeInMinutes = 114;
    expect(calendar.scheduleOf(itinerary, day1).map(describeEntry)).toEqual([
      "drive: 10:00 a.m. to 12:45 p.m.",
      "stop Lunch place: 12:45 p.m. to 1:45 p.m.",
      "drive: 1:45 p.m. to 3:57 p.m.",
      "stop check in and freshen up: 3:57 p.m. to 5:51 p.m.",
      "drive: 5:51 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 8:00 p.m.",
      "drive: 8:00 p.m. to 8:09 p.m.",
    ]);
  });

  it("moves to the lodging once one is selected, and the leg is re-routed through it", async () => {
    const planning = checkInDay();
    const { itinerary, calendar, legs, finder, barHarbor, day1, checkIn } =
      planning;
    await legs.updateLegs(itinerary);
    forgetCalls(finder);
    expect(calendar.placeOf(itinerary, checkIn)).toBe(BAR_HARBOR);
    lodgeAt(planning, barHarbor, BAR_HARBOR_INN);
    expect(calendar.placeOf(itinerary, checkIn)).toBe(BAR_HARBOR_INN);
    const changes = await legs.updateLegs(itinerary);
    expect(changes.map((change) => change.day)).toContain(day1);
    expect(present(day1.leg).routedStopPlaces).toEqual([
      LUNCH_PLACE,
      BAR_HARBOR_INN,
      COLLEGE,
    ]);
    expect(present(day1.leg).routedToPlace).toBe(BAR_HARBOR_INN);
  });

  it("is at that night's stay, wherever it moves, and has the place from the moment it's added", () => {
    const { itinerary, calendar, services, barHarbor, day1, checkIn } =
      checkInDay();
    expect(checkIn.status).toBe("selected");
    expect(calendar.placeOf(itinerary, checkIn)).toBe(BAR_HARBOR);
    // Day 3 starts at Bar Harbor and ends at Camden, so only the night's stay gives
    // Camden.
    const camden = services.stays.addStay(itinerary, {
      place: CAMDEN,
      nightCount: 1,
      tier: "value",
      tierRule: "the trip default",
      after: barHarbor,
    });
    const day3 = present(camden.days[0]);
    services.stops.moveStop(itinerary, checkIn, {
      toDay: day3,
      after: null,
      setTime: null,
    });
    expect(calendar.placeOf(itinerary, checkIn)).toBe(CAMDEN);
    expect(calendar.hasLeg(itinerary, day3)).toBe(true);
    expect(day1.stops).not.toContain(checkIn);
  });

  it("gives no opening hours result, and doesn't mark a later stop's result as maybe too early", async () => {
    const { trip, itinerary, calendar, legs, checkIn, event } = checkInDay();
    await legs.updateLegs(itinerary);
    const results = checkerFor(trip, calendar).workOut(itinerary);
    expect(results.filter((result) => result.subjectId === checkIn.id)).toEqual(
      [],
    );
    expect(
      results.some(
        (result) =>
          result.subjectId === event.id && result.hasUnselectedStopBefore,
      ),
    ).toBe(false);
  });
});

describe("the check-in's rules", () => {
  it("is refused on the last day, which has no stay to sleep at", () => {
    const { itinerary, services, checkIn } = checkInDay();
    const another = services.stops.newCheckIn("check in", null);
    expect(() => {
      services.stops.addStops(itinerary, itinerary.lastDay, [another], null);
    }).toThrow("the last day has no stay to sleep at");
    expect(() => {
      services.stops.moveStop(itinerary, checkIn, {
        toDay: itinerary.lastDay,
        after: null,
        setTime: null,
      });
    }).toThrow("the last day has no stay to sleep at");
  });

  it("is refused as a second check-in on a day, when added or moved", () => {
    const { itinerary, services, barHarbor, day1 } = checkInDay();
    const day2 = present(barHarbor.days[1]);
    const second = services.stops.newCheckIn("check in again", null);
    expect(() => {
      services.stops.addStops(itinerary, day1, [second], null);
    }).toThrow("A day holds at most one check-in.");
    const third = services.stops.newCheckIn("check in", null);
    const fourth = services.stops.newCheckIn("check in", null);
    expect(() => {
      services.stops.addStops(itinerary, day2, [third, fourth], null);
    }).toThrow("A day holds at most one check-in.");
    services.stops.addStops(itinerary, day2, [third], null);
    expect(() => {
      services.stops.moveStop(itinerary, third, {
        toDay: day1,
        after: null,
        setTime: null,
      });
    }).toThrow("A day holds at most one check-in.");
  });

  it("starts with the check-in visit time, and takes no candidates or tier", () => {
    const planning = checkInDay();
    const { checkIn } = planning;
    expect(checkIn.visitTimeInMinutes).toBe(30);
    expect(checkIn.searchArea).toBeNull();
    expect(() => {
      pick(planning, checkIn, BAR_HARBOR_INN);
    }).toThrow("A check-in has no candidates.");
    expect(() => {
      checkIn.setTier("value", "the trip default");
    }).toThrow("Only a meal stop has a tier. This one is a check-in.");
  });
});

const CAMDEN = placeAt("Camden", 44.2098, -69.0648);
const PIE_PLACE = placeAt("Pie place", 43.9, -69.9);
const DESSERT_PLACE = placeAt("Dessert place", 44.388, -68.204);

// Day 1 with pie after lunch, and dessert after the event, so each side of the
// check-in has two stops. Lunch, pie, the check-in, the event, dessert, then the stay.
function twoStopsEachSide() {
  const planning = checkInDay();
  const { itinerary, services, day1, lunch, event, barHarbor, finder } =
    planning;
  const pie = attraction({ purpose: "pie", searchArea: "alongLeg" });
  const dessert = attraction({
    purpose: "dessert",
    searchArea: "nearStay",
    stay: barHarbor,
    setTime: at("20:30"),
  });
  services.stops.addStops(itinerary, day1, [pie], lunch);
  services.stops.addStops(itinerary, day1, [dessert], event);
  pick(planning, pie, PIE_PLACE, 30);
  pick(planning, dessert, DESSERT_PLACE, 30);
  finder.driveTimesFor = () => [150, 20, 100, 8, 5, 8];
  return { ...planning, pie, dessert };
}

describe("the stop-order check on a day with a check-in", () => {
  it("keeps the check-in in its place, and orders only the stops before it and after it, each on their own", async () => {
    const planning = twoStopsEachSide();
    const { trip, itinerary, calendar, legs, finder } = planning;
    const { day1, lunch, checkIn, event, pie, dessert } = planning;
    // Pie first saves 40 minutes before the check-in. After it, the order holds.
    finder.bestOrderFor = (path) =>
      path.to === BAR_HARBOR && path.from === NATICK
        ? { order: [1, 0], driveTimes: [100, 20, 110] }
        : null;
    await legs.updateLegs(itinerary);
    expect(finder.bestOrders).toEqual([
      { from: NATICK, stops: [LUNCH_PLACE, PIE_PLACE], to: BAR_HARBOR },
      { from: BAR_HARBOR, stops: [COLLEGE, DESSERT_PLACE], to: BAR_HARBOR },
    ]);
    const leg = present(day1.leg);
    expect(leg.stopsInBestOrder).toEqual([pie, lunch, checkIn, event, dessert]);
    expect(leg.timeSavedInMinutes).toBe(40);
    // No waypoints, so the day's own order is the leg's own segments. The other route
    // is the last day's.
    expect(finder.routes.map((route) => route.from)).toEqual([
      NATICK,
      BAR_HARBOR,
    ]);
    expect(
      resultOf(
        checkerFor(trip, calendar).workOut(itinerary),
        "stopOrder",
        day1.id,
      )?.text,
    ).toBe(
      "On Day 1, a faster order saves about 40 minutes: Pie place, then Lunch place, then Bar Harbor, then College of the Atlantic, then Dessert place.",
    );
  });

  it("works out the saving after the check-in from the leg's segments after it", async () => {
    const {
      itinerary,
      legs,
      finder,
      day1,
      lunch,
      checkIn,
      event,
      pie,
      dessert,
    } = twoStopsEachSide();
    // Dessert before the event saves 3 minutes: 18 against the event, dessert, and the
    // drive back, 8 + 5 + 8. Before the check-in, the order holds.
    finder.bestOrderFor = (path) =>
      path.from === BAR_HARBOR
        ? { order: [1, 0], driveTimes: [6, 5, 7] }
        : null;
    await legs.updateLegs(itinerary);
    const leg = present(day1.leg);
    expect(leg.stopsInBestOrder).toEqual([lunch, pie, checkIn, dessert, event]);
    expect(leg.timeSavedInMinutes).toBe(3);
  });

  it("asks Google for no order when neither side of the check-in has two stops", async () => {
    const { itinerary, legs, finder, day1 } = checkInDay();
    await legs.updateLegs(itinerary);
    expect(finder.bestOrders).toEqual([]);
    expect(present(day1.leg).stopsInBestOrder).toEqual([]);
    expect(present(day1.leg).timeSavedInMinutes).toBe(0);
  });
});
