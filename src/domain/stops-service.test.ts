import { describe, expect, it } from "vitest";

import {
  at,
  attraction,
  meal,
  type Planning,
} from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";

function moabPlanning(): Planning & ReturnType<typeof moabExample> {
  const example = moabExample();
  return { ...example, itinerary: example.trip.itinerary };
}

describe("StopsService.addStops", () => {
  it("adds the stops in order after the stop given, or first", () => {
    const { itinerary, services, moab } = moabPlanning();
    const day2 = present(moab.days[1]);
    const [first, second] = day2.stops;
    const coffee = meal({
      purpose: "coffee",
      searchArea: "nearStay",
      stay: moab,
    });
    const view = attraction({
      purpose: "a view",
      searchArea: "nearStay",
      stay: moab,
    });
    const early = meal({
      purpose: "early bite",
      searchArea: "nearStay",
      stay: moab,
    });
    services.stops.addStops(itinerary, day2, [coffee, view], present(first));
    services.stops.addStops(itinerary, day2, [early], null);
    expect(day2.stops.slice(0, 5)).toEqual([
      early,
      first,
      coffee,
      view,
      second,
    ]);
  });

  it("refuses the whole call when a stop doesn't fit the day, and says why for each", () => {
    const { itinerary, services, moab, torrey } = moabPlanning();
    const day1 = present(moab.days[0]);
    const day2 = present(moab.days[1]);
    const day3 = present(moab.days[2]);
    const refusals: [typeof day1, ReturnType<typeof meal>, string][] = [
      [
        day1,
        meal({ purpose: "pie", searchArea: "nearStay", stay: torrey }),
        "is near a stay this day doesn't start or end at.",
      ],
      [
        day2,
        meal({ purpose: "pie", searchArea: "alongLeg" }),
        "is along the leg, but this day stays put, so it has no leg to be along.",
      ],
      [
        day2,
        meal({ purpose: "pie", searchArea: "nearStartPlace" }),
        "is near the start place, but this isn't the first day.",
      ],
      [
        day1,
        meal({ purpose: "pie", searchArea: "nearEndPlace" }),
        "is near the end place, but this isn't the last day.",
      ],
      [
        day3,
        meal({ purpose: "pie", searchArea: "nearStay", stay: moab }),
        "has no set time, and each stop on a rest day needs one.",
      ],
    ];
    for (const [day, stop, reason] of refusals) {
      const fits = meal({
        purpose: "fits",
        searchArea: "nearStay",
        stay: moab,
        setTime: at("15:00"),
      });
      const before = day.stops;
      expect(() => {
        services.stops.addStops(itinerary, day, [fits, stop], null);
      }).toThrow(`No stops were added. pie (${stop.id}) ${reason}`);
      expect(day.stops).toEqual(before);
    }
  });

  it("lets each search area onto the days it fits", () => {
    const { trip, services } = sanFranciscoExample();
    const itinerary = trip.itinerary;
    const [day1, day2, day3] = itinerary.days;
    const nearStart = meal({ purpose: "pastry", searchArea: "nearStartPlace" });
    const nearEnd = meal({ purpose: "tacos", searchArea: "nearEndPlace" });
    const alongLeg = attraction({ purpose: "a beach", searchArea: "alongLeg" });
    services.stops.addStops(itinerary, present(day1), [nearStart], null);
    services.stops.addStops(
      itinerary,
      present(day3),
      [nearEnd, alongLeg],
      null,
    );
    expect(present(day3).stops).toEqual([nearEnd, alongLeg]);
    expect(present(day2).stops).toHaveLength(7);
  });

  it("refuses an `after` that isn't on the day, or a stop already in the itinerary", () => {
    const { itinerary, services, moab } = moabPlanning();
    const day1 = present(moab.days[0]);
    const day2 = present(moab.days[1]);
    const coffee = meal({
      purpose: "coffee",
      searchArea: "nearStay",
      stay: moab,
    });
    expect(() => {
      services.stops.addStops(
        itinerary,
        day2,
        [coffee],
        present(day1.stops[0]),
      );
    }).toThrow("The stop to place them after has to be on the day");
    const milts = present(day2.stops[3]);
    expect(() => {
      services.stops.addStops(itinerary, day1, [milts], null);
    }).toThrow(`burgers (${milts.id}) is already in the itinerary.`);
  });
});

describe("StopsService.moveStop", () => {
  it("moves a stop to another day with its selection and approvals, and sets its time", () => {
    const { itinerary, services, moab, stops } = moabPlanning();
    const day2 = present(moab.days[1]);
    const day3 = present(moab.days[2]);
    services.stops.approveOpeningHours(itinerary, stops.milts, "we eat fast");
    services.stops.moveStop(itinerary, stops.milts, {
      toDay: day3,
      after: null,
      setTime: at("12:30"),
    });
    expect(day2.stops).not.toContain(stops.milts);
    expect(day3.stops[0]).toBe(stops.milts);
    expect(stops.milts.setTime?.time.toText()).toBe("12:30");
    expect(stops.milts.selectedPlace?.name).toBe("Milt's");
    expect(stops.milts.approvals).toHaveLength(1);
  });

  it("moves a stop within its own day, and lets a stop near a stay land on a day it doesn't fit", () => {
    const { itinerary, services, moab, torrey, stops } = moabPlanning();
    const day2 = present(moab.days[1]);
    services.stops.moveStop(itinerary, stops.milts, {
      toDay: day2,
      after: null,
      setTime: null,
    });
    expect(day2.stops[0]).toBe(stops.milts);
    expect(stops.milts.setTime).toBeNull();
    const day4 = present(torrey.days[0]);
    services.stops.moveStop(itinerary, stops.milts, {
      toDay: day4,
      after: day4.stops.at(-1) ?? null,
      setTime: null,
    });
    expect(day4.stops.at(-1)).toBe(stops.milts);
  });

  it("refuses a stop along the leg on a day that stays put, and an untimed stop on a rest day", () => {
    const { itinerary, services, moab, torrey, stops } = moabPlanning();
    const day2 = present(moab.days[1]);
    const day3 = present(moab.days[2]);
    const day4 = present(torrey.days[0]);
    expect(() => {
      services.stops.moveStop(itinerary, stops.gifford, {
        toDay: day2,
        after: null,
        setTime: at("12:00"),
      });
    }).toThrow("Remove the stop and add a new one instead.");
    expect(() => {
      services.stops.moveStop(itinerary, stops.milts, {
        toDay: day3,
        after: null,
        setTime: null,
      });
    }).toThrow(`burgers (${stops.milts.id}) needs a set time`);
    expect(day4.stops).toContain(stops.gifford);
    expect(day2.stops).toContain(stops.milts);
  });

  it("refuses an `after` that isn't on the day, or is the stop itself, by the day's own rule", () => {
    const { itinerary, services, moab, stops } = moabPlanning();
    const day1 = present(moab.days[0]);
    const day2 = present(moab.days[1]);
    const notOnDay1 = present(day2.stops[0]);
    for (const after of [notOnDay1, stops.fisherTowers]) {
      expect(() => {
        services.stops.moveStop(itinerary, stops.fisherTowers, {
          toDay: day1,
          after,
          setTime: null,
        });
      }).toThrow("The stop to place them after has to be on the day");
    }
    expect(day1.stops[1]).toBe(stops.fisherTowers);
  });
});

describe("StopsService.removeStops", () => {
  it("removes stops from several days, with their candidates", () => {
    const { itinerary, services, moab, stops } = moabPlanning();
    services.stops.removeStops(itinerary, [stops.milts, stops.gifford]);
    expect(present(moab.days[1]).stops).not.toContain(stops.milts);
    expect(itinerary.days.flatMap((day) => day.stops)).not.toContain(
      stops.gifford,
    );
  });

  it("refuses the whole call when a stop isn't in the itinerary", () => {
    const { itinerary, services, stops } = moabPlanning();
    const stray = meal({ purpose: "stray", searchArea: "alongLeg" });
    expect(() => {
      services.stops.removeStops(itinerary, [stops.milts, stray]);
    }).toThrow(`The itinerary has no stop stray (${stray.id}).`);
    expect(itinerary.days.flatMap((day) => day.stops)).toContain(stops.milts);
  });
});

describe("StopsService.setStopTime", () => {
  it("sets or clears a stop's set time", () => {
    const { itinerary, services, stops } = moabPlanning();
    services.stops.setStopTime(itinerary, stops.milts, at("12:15"));
    expect(stops.milts.setTime?.time.toText()).toBe("12:15");
    services.stops.setStopTime(itinerary, stops.milts, null);
    expect(stops.milts.setTime).toBeNull();
  });

  it("refuses to clear the set time of a stop on a rest day", () => {
    const { itinerary, services, moab } = moabPlanning();
    const dinner = present(moab.days[2]?.stops[0]);
    expect(() => {
      services.stops.setStopTime(itinerary, dinner, null);
    }).toThrow("needs a set time, since each stop on a rest day has one.");
    expect(dinner.setTime?.time.toText()).toBe("18:30");
  });
});
