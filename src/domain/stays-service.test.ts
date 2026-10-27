import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import {
  OWNER,
  placeNamed,
  type Planning,
  planningFor,
} from "./example-trip-parts.fake.js";
import { present, userOffer, workerOffer } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { RejectedPlace } from "./rejected-place.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";
import type { Stay } from "./stay.js";
import { newTrip } from "./trip.js";

// A trip with its ends and start date set, and no stays yet.
function readyToAddStays(): Planning {
  const planning = planningFor(newTrip(OWNER, new Date()));
  const { itinerary, services } = planning;
  services.itinerary.setStartPlace(itinerary, placeNamed("Grand Junction"));
  itinerary.endPlace = placeNamed("Salt Lake City");
  services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 10));
  return planning;
}

function addStay(
  planning: Planning,
  town: string,
  nightCount: number,
  after: Stay | null = null,
): Stay {
  return planning.services.stays.addStay(planning.itinerary, {
    place: placeNamed(town),
    nightCount,
    after,
  });
}

function townsOf(planning: Planning): (string | null)[] {
  return planning.itinerary.stays.map((stay) => stay.place.name);
}

describe("StaysService.addStay", () => {
  it("puts a new stay with its days after the stay given, or first, and later days keep their IDs", () => {
    const planning = readyToAddStays();
    const moab = addStay(planning, "Moab", 3);
    const lastDayId = planning.itinerary.lastDay.id;
    addStay(planning, "Torrey", 1, moab);
    addStay(planning, "Fruita", 1);
    expect(townsOf(planning)).toEqual(["Fruita", "Moab", "Torrey"]);
    expect(planning.itinerary.dayCount).toBe(6);
    expect(moab.days).toHaveLength(3);
    expect(planning.itinerary.days.at(-1)?.id).toBe(lastDayId);
  });

  it("refuses until the itinerary has its start place, end place, and start date", () => {
    const planning = planningFor(newTrip(OWNER, new Date()));
    planning.services.itinerary.setStartPlace(
      planning.itinerary,
      placeNamed("Grand Junction"),
    );
    expect(() => addStay(planning, "Moab", 1)).toThrow(
      "It still needs its end place, start date.",
    );
  });

  it("refuses a trip longer than the maximum, and gives the limit", () => {
    const planning = readyToAddStays();
    addStay(planning, "Moab", 10);
    expect(() => addStay(planning, "Torrey", 4)).toThrow(
      "A trip is at most 14 days long. This would make it 15.",
    );
    expect(townsOf(planning)).toEqual(["Moab"]);
  });

  it("refuses by the stay's own rules: fewer than 1 night", () => {
    const planning = readyToAddStays();
    expect(() => addStay(planning, "Moab", 0)).toThrow(
      "A stay has a whole number of nights, at least 1.",
    );
  });

  it("refuses an `after` that isn't one of the itinerary's stays", () => {
    const planning = readyToAddStays();
    const elsewhere = addStay(readyToAddStays(), "Moab", 1);
    expect(() => addStay(planning, "Torrey", 1, elsewhere)).toThrow(
      `The itinerary has no stay ${elsewhere.id}.`,
    );
    expect(townsOf(planning)).toEqual([]);
  });
});

describe("StaysService.moveStay", () => {
  it("moves the stay with its days and their stops", () => {
    const { trip, services, moab, torrey } = moabExample();
    const itinerary = trip.itinerary;
    const day4 = present(torrey.days[0]);
    services.stays.moveStay(itinerary, torrey, null);
    expect(itinerary.stays).toEqual([torrey, moab]);
    expect(itinerary.days[0]).toBe(day4);
    expect(day4.stops).toHaveLength(4);
  });

  it("refuses a move after itself, or after a stay that isn't in the itinerary", () => {
    const { trip, services, moab } = moabExample();
    expect(() => {
      services.stays.moveStay(trip.itinerary, moab, moab);
    }).toThrow("A stay can't be placed after itself.");
    const other = moabExample().moab;
    expect(() => {
      services.stays.moveStay(trip.itinerary, moab, other);
    }).toThrow(`The itinerary has no stay ${other.id}.`);
    expect(() => {
      services.stays.moveStay(trip.itinerary, other, null);
    }).toThrow(`The itinerary has no stay ${other.id}.`);
  });
});

describe("StaysService.setNightCount", () => {
  it("adds empty days at the end of the stay, and returns them", () => {
    const { trip, services, torrey } = moabExample();
    const added = services.stays.setNightCount(trip.itinerary, torrey, 3);
    expect(added).toHaveLength(2);
    expect(torrey.days.slice(1)).toEqual(added);
    expect(added.every((day) => day.stops.length === 0)).toBe(true);
    expect(trip.itinerary.dayCount).toBe(7);
  });

  it("removes empty days from the end, and returns none", () => {
    const planning = readyToAddStays();
    const moab = addStay(planning, "Moab", 3);
    const firstDay = moab.days[0];
    expect(
      planning.services.stays.setNightCount(planning.itinerary, moab, 1),
    ).toEqual([]);
    expect(moab.days).toEqual([firstDay]);
  });

  it("refuses to remove a day that holds stops, and lists them", () => {
    const { trip, services, moab } = moabExample();
    const day3Dinner = present(moab.days[2]?.stops[0]);
    expect(() => services.stays.setNightCount(trip.itinerary, moab, 2)).toThrow(
      `The days that would go still hold stops. Move or remove them first: dinner near the hotel at The Spoke on Center (${day3Dinner.id}).`,
    );
    expect(moab.nightCount).toBe(3);
  });

  it("refuses a trip longer than the maximum, or fewer than 1 night", () => {
    const { trip, services, torrey } = moabExample();
    expect(() =>
      services.stays.setNightCount(trip.itinerary, torrey, 11),
    ).toThrow("A trip is at most 14 days long. This would make it 15.");
    expect(() =>
      services.stays.setNightCount(trip.itinerary, torrey, 0),
    ).toThrow("A stay has a whole number of nights, at least 1.");
  });
});

describe("StaysService.removeStay", () => {
  it("removes a stay that no stop depends on", () => {
    const planning = readyToAddStays();
    const moab = addStay(planning, "Moab", 2);
    planning.services.stays.removeStay(planning.itinerary, moab);
    expect(planning.itinerary.stays).toEqual([]);
    expect(planning.itinerary.dayCount).toBe(1);
  });

  it("refuses while stops are on its days, and lists each by purpose, place, and ID", () => {
    const { trip, services, torrey } = moabExample();
    const [hoodoos] = present(torrey.days[0]).stops;
    expect(() => {
      services.stays.removeStay(trip.itinerary, torrey);
    }).toThrow(
      `Move or remove them first: hoodoos at Goblin Valley State Park (${present(hoodoos).id});`,
    );
    expect(trip.itinerary.stays).toContain(torrey);
  });

  it("refuses while a stop on another day is near it", () => {
    const { trip, services, monterey, sanLuisObispo } = sanFranciscoExample();
    const day1 = present(monterey.days[0]);
    services.stops.removeStops(trip.itinerary, day1.stops);
    const breakfast = present(sanLuisObispo.days[0]?.stops[0]);
    expect(() => {
      services.stays.removeStay(trip.itinerary, monterey);
    }).toThrow(
      `Move or remove them first: breakfast before the drive at First Awakenings, Monterey (${breakfast.id}).`,
    );
  });
});

describe("StaysService.addLodgingCandidates", () => {
  it("adds one set, with the tier each candidate came with", () => {
    const { trip, services, torrey } = moabExample();
    services.stays.addLodgingCandidates(trip.itinerary, torrey, [
      { ...workerOffer(placeNamed("Red Sands Hotel")), tier: "value" },
      { ...workerOffer(placeNamed("Capitol Reef Resort")), tier: "upscale" },
    ]);
    const added = torrey.lodgingCandidates.slice(1);
    expect(added.map((each) => [each.setNumber, each.tier])).toEqual([
      [1, "value"],
      [1, "upscale"],
    ]);
  });

  it("refuses the whole set when a place is rejected", () => {
    const { trip, services, torrey } = moabExample();
    const rejected = placeNamed("Kitschy motel");
    services.rejections.rejectPlaces(trip.itinerary, [
      new RejectedPlace({ place: rejected, reason: "too kitschy for us" }),
    ]);
    expect(() => {
      services.stays.addLodgingCandidates(trip.itinerary, torrey, [
        workerOffer(placeNamed("Red Sands Hotel")),
        workerOffer(rejected),
      ]);
    }).toThrow("The user rejected Kitschy motel, so it can't be a candidate.");
    expect(torrey.lodgingCandidates).toHaveLength(1);
  });

  it("refuses by the stay's own rules: the set's size, a repeat, or a visit time", () => {
    const { trip, services, torrey } = moabExample();
    const add = (
      offers: Parameters<typeof services.stays.addLodgingCandidates>[2],
    ) => {
      services.stays.addLodgingCandidates(trip.itinerary, torrey, offers);
    };
    expect(() => {
      add([]);
    }).toThrow("A set of candidates holds 1 to 3.");
    const four = ["A", "B", "C", "D"].map((name) =>
      workerOffer(placeNamed(name)),
    );
    expect(() => {
      add(four);
    }).toThrow("A set of candidates holds 1 to 3.");
    expect(() => {
      add([userOffer(present(torrey.lodging))]);
    }).toThrow("Torrey hotel is already one of the candidates.");
    expect(() => {
      add([{ ...workerOffer(placeNamed("Inn")), visitTimeInMinutes: 60 }]);
    }).toThrow("a lodging candidate has no visit time or detour time.");
    expect(torrey.lodgingCandidates).toHaveLength(1);
  });
});
