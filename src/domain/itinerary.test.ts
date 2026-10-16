import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import { CheckResult } from "./check-result.js";
import { exampleMoabTrip, namedPlace, present } from "./itinerary.fake.js";
import { RejectedPlace } from "./rejected-place.js";
import { RuleError } from "./rule-error.js";
import { newStay, type Stay } from "./stay.js";
import { newTrip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };
const START_DATE = new CalendarDate(2027, 5, 13);

function newItinerary() {
  return newTrip(OWNER, new Date()).itinerary;
}

function stayIn(name: string, nightCount = 1): Stay {
  return newStay({
    place: namedPlace(name),
    nightCount,
    tier: "value",
    tierRule: "the trip default",
  });
}

describe("the itinerary's start and end places", () => {
  it("start empty, change, and can't be emptied", () => {
    const itinerary = newItinerary();
    expect(itinerary.startPlace).toBeNull();
    itinerary.startPlace = namedPlace("San Francisco");
    itinerary.endPlace = namedPlace("Mike's house");
    itinerary.startPlace = namedPlace("Oakland");
    expect(itinerary.startPlace.name).toBe("Oakland");
    expect(() => (itinerary.startPlace = null)).toThrow("can't be empty");
    expect(() => (itinerary.endPlace = null)).toThrow(RuleError);
  });
});

describe("the itinerary's start date", () => {
  it("needs a start place first", () => {
    const itinerary = newItinerary();
    expect(() => {
      itinerary[VIA_SERVICE].setStartDate(START_DATE);
    }).toThrow("start place");
    itinerary.startPlace = namedPlace("San Francisco");
    itinerary[VIA_SERVICE].setStartDate(START_DATE);
    expect(itinerary.startDate).toBe(START_DATE);
  });

  it("gives the end date, from the number of days", () => {
    const itinerary = newItinerary();
    expect(itinerary.endDate).toBeNull();
    itinerary.startPlace = namedPlace("San Francisco");
    itinerary[VIA_SERVICE].setStartDate(START_DATE);
    itinerary[VIA_SERVICE].placeStay(stayIn("Monterey"), null);
    expect(itinerary.endDate?.toText()).toBe("2027-05-14");
  });
});

describe("the itinerary's stays", () => {
  it("go after the stay given, or first, and its days follow them", () => {
    const itinerary = newItinerary();
    const [monterey, slo, bigSur] = ["Monterey", "SLO", "Big Sur"].map((name) =>
      stayIn(name),
    );
    itinerary[VIA_SERVICE].placeStay(present(slo), null);
    itinerary[VIA_SERVICE].placeStay(present(monterey), null);
    itinerary[VIA_SERVICE].placeStay(present(bigSur), present(monterey));
    expect(itinerary.stays).toEqual([monterey, bigSur, slo]);
    expect(itinerary.days).toEqual([
      ...present(monterey).days,
      ...present(bigSur).days,
      ...present(slo).days,
      itinerary.lastDay,
    ]);
    expect(itinerary.dayCount).toBe(4);
  });

  it("move, and refuse a stay placed after itself or after one it doesn't hold", () => {
    const itinerary = newItinerary();
    const [moab, torrey] = [stayIn("Moab", 3), stayIn("Torrey")];
    itinerary[VIA_SERVICE].placeStay(moab, null);
    itinerary[VIA_SERVICE].placeStay(torrey, moab);
    itinerary[VIA_SERVICE].placeStay(moab, torrey);
    expect(itinerary.stays).toEqual([torrey, moab]);
    expect(() => {
      itinerary[VIA_SERVICE].placeStay(moab, moab);
    }).toThrow("after itself");
    expect(() => {
      itinerary[VIA_SERVICE].placeStay(moab, stayIn("Elsewhere"));
    }).toThrow("no stay");
  });

  it("are removed only when the itinerary holds them", () => {
    const itinerary = newItinerary();
    const moab = stayIn("Moab");
    expect(() => {
      itinerary[VIA_SERVICE].removeStay(moab);
    }).toThrow("no stay");
    itinerary[VIA_SERVICE].placeStay(moab, null);
    itinerary[VIA_SERVICE].removeStay(moab);
    expect(itinerary.stays).toEqual([]);
    expect(itinerary.dayCount).toBe(1);
  });
});

describe("the itinerary's rejected places", () => {
  it("skip a place already rejected, keeping its first reason", () => {
    const itinerary = newItinerary();
    const motel = namedPlace("Kitschy motel");
    itinerary[VIA_SERVICE].addRejectedPlace(
      new RejectedPlace({ place: motel, reason: "too kitschy" }),
    );
    itinerary[VIA_SERVICE].addRejectedPlace(
      new RejectedPlace({ place: motel, reason: "too far" }),
    );
    expect(itinerary.rejectedPlaces.map((each) => each.reason)).toEqual([
      "too kitschy",
    ]);
    expect(itinerary.isRejected(motel)).toBe(true);
    expect(itinerary.isRejected(namedPlace("Other motel"))).toBe(false);
  });

  it("need the user's reason", () => {
    expect(
      () => new RejectedPlace({ place: namedPlace("A"), reason: " " }),
    ).toThrow("reason");
  });
});

describe("Itinerary.replaceCheckResults", () => {
  const late = new CheckResult({
    check: "lateForSetTime",
    subjectId: "stop_k7m2x9qa",
    text: "You'd reach dinner at 8:15.",
    isApproved: false,
    hasUnselectedStopBefore: false,
  });

  it("replaces the whole list", () => {
    const itinerary = newItinerary();
    itinerary.replaceCheckResults([late]);
    expect(itinerary.checkResults).toEqual([late]);
    itinerary.replaceCheckResults([]);
    expect(itinerary.checkResults).toEqual([]);
  });

  it("refuses two results with the same check and subject", () => {
    const itinerary = newItinerary();
    expect(() => {
      itinerary.replaceCheckResults([late, late]);
    }).toThrow("only one lateForSetTime");
  });
});

describe("the itinerary's worked-out values", () => {
  it("add up the drive time of every leg", () => {
    const { trip } = exampleMoabTrip(OWNER);
    expect(trip.itinerary.dayCount).toBe(5);
    expect(trip.itinerary.endDate?.toText()).toBe("2027-10-14");
    expect(trip.itinerary.totalDriveTimeInMinutes).toBe(130);
  });

  it("give copies of its lists that can't be changed", () => {
    const { trip } = exampleMoabTrip(OWNER);
    expect(Object.isFrozen(trip.itinerary.stays)).toBe(true);
    expect(Object.isFrozen(trip.itinerary.days)).toBe(true);
    expect(Object.isFrozen(trip.itinerary.rejectedPlaces)).toBe(true);
  });
});

describe("Trip", () => {
  it("is named for its focus, and its start month once it has a start date", () => {
    const trip = newTrip(OWNER, new Date());
    expect(trip.name).toBeNull();
    trip.tripBrief.focus = "Pacific Coast Highway";
    expect(trip.name).toBe("Pacific Coast Highway");
    trip.itinerary.startPlace = namedPlace("San Francisco");
    trip.itinerary[VIA_SERVICE].setStartDate(START_DATE);
    expect(trip.name).toBe("Pacific Coast Highway, May 2027");
  });

  it("has started once today reaches the start date", () => {
    const trip = newTrip(OWNER, new Date());
    expect(trip.hasStarted(new Date())).toBe(false);
    trip.itinerary.startPlace = namedPlace("San Francisco");
    trip.itinerary[VIA_SERVICE].setStartDate(new CalendarDate(2020, 1, 1));
    expect(trip.hasStarted(new Date())).toBe(true);
  });
});
