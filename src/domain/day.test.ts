import { describe, expect, it } from "vitest";

import {
  DriveHoursApproval,
  OpeningHoursApproval,
  RouteTypeApproval,
} from "./approval.js";
import { namedPlace } from "./itinerary.fake.js";
import { LastDay } from "./last-day.js";
import { Leg } from "./leg.js";
import { StayDay } from "./stay-day.js";
import { newStop, type Stop } from "./stop.js";
import { VIA_SERVICE } from "./via-service.js";

const BIG_SUR = namedPlace("Big Sur village");
const FIVE_HOURS = new DriveHoursApproval({
  reason: "the hoodoos",
  approvedDrivingInHours: 5,
});

function newDay(): StayDay {
  return new StayDay({
    id: "day_k7m2x9qa",
    ownStartTime: null,
    approvals: [],
    isRestDay: false,
  });
}

function stop(purpose: string): Stop {
  return newStop({
    kind: "attraction",
    purpose,
    searchArea: "alongLeg",
    searchAreaStay: null,
    setTime: null,
    tier: null,
    tierRule: null,
  });
}

function fourStops(): [Stop, Stop, Stop, Stop] {
  return [stop("a"), stop("b"), stop("c"), stop("d")];
}

function leg(): Leg {
  return new Leg({
    segmentDriveTimesInMinutes: [70, 60],
    distanceInMiles: 140,
    routeLine: "_p~iF~ps|U",
    stopsInBestOrder: [],
    timeSavedInMinutes: 0,
    routedFromPlace: namedPlace("Monterey"),
    routedToPlace: namedPlace("San Luis Obispo"),
    routedStopPlaces: [],
    routedWaypoints: [BIG_SUR],
  });
}

describe("a day's stops", () => {
  it("go in the order given, after the stop given, or first", () => {
    const day = newDay();
    const [a, b, c, d] = fourStops();
    day[VIA_SERVICE].placeStops([b, c], null);
    day[VIA_SERVICE].placeStops([a], null);
    day[VIA_SERVICE].placeStops([d], b);
    expect(day.stops).toEqual([a, b, d, c]);
  });

  it("move when a stop already on the day is placed again", () => {
    const day = newDay();
    const [a, b, c] = fourStops();
    day[VIA_SERVICE].placeStops([a, b, c], null);
    day[VIA_SERVICE].placeStops([a], c);
    expect(day.stops).toEqual([b, c, a]);
  });

  it("hold each stop once, after a stop that's on the day and not being placed", () => {
    const day = newDay();
    const [a, b] = fourStops();
    expect(() => {
      day[VIA_SERVICE].placeStops([a, a], null);
    }).toThrow("each stop once");
    expect(() => {
      day[VIA_SERVICE].placeStops([a], b);
    }).toThrow("has to be on the day");
    day[VIA_SERVICE].placeStops([a, b], null);
    expect(() => {
      day[VIA_SERVICE].placeStops([a], a);
    }).toThrow("not one being placed");
  });

  it("are removed only when they're on the day", () => {
    const day = newDay();
    const [a, b] = fourStops();
    day[VIA_SERVICE].placeStops([a], null);
    expect(() => {
      day[VIA_SERVICE].removeStops([b]);
    }).toThrow("aren't on the day");
    day[VIA_SERVICE].removeStops([a]);
    expect(day.stops).toEqual([]);
  });
});

describe("a day's waypoints", () => {
  it("are refused while the day has no leg", () => {
    expect(() => {
      newDay().setWaypoints([BIG_SUR]);
    }).toThrow("no leg");
  });

  it("go when the leg goes", () => {
    const day = newDay();
    day[VIA_SERVICE].setLeg(leg());
    day.setWaypoints([BIG_SUR]);
    expect(day.waypoints).toEqual([BIG_SUR]);
    day[VIA_SERVICE].setLeg(null);
    expect(day.waypoints).toEqual([]);
  });
});

describe("a rest day", () => {
  it("keeps its leg, waypoints, and approvals until LegsService removes the leg at the end of the write", () => {
    const day = newDay();
    const itsLeg = leg();
    day[VIA_SERVICE].setLeg(itsLeg);
    day.setWaypoints([BIG_SUR]);
    day[VIA_SERVICE].setApproval(FIVE_HOURS);
    day[VIA_SERVICE].setRestDay(true);
    expect([day.isRestDay, day.leg, day.waypoints]).toEqual([
      true,
      itsLeg,
      [BIG_SUR],
    ]);
    expect(day.approvals).toEqual([FIVE_HOURS]);
  });

  it("is only a stay day: the last day has no rest-day mark", () => {
    const lastDay = new LastDay({
      id: "day_k7m2x9qa",
      ownStartTime: null,
      approvals: [],
    });
    expect(lastDay.kind).toBe("lastDay");
    expect("isRestDay" in lastDay).toBe(false);
  });
});

describe("a day's approvals", () => {
  it("hold at most one of each kind, a new one replacing the old", () => {
    const day = newDay();
    const fastest = new RouteTypeApproval({
      reason: "get home",
      approvedRouteType: "fastest",
    });
    const sixHours = new DriveHoursApproval({
      reason: "a long day",
      approvedDrivingInHours: 6,
    });
    day[VIA_SERVICE].setApproval(FIVE_HOURS);
    day[VIA_SERVICE].setApproval(fastest);
    day[VIA_SERVICE].setApproval(sixHours);
    expect(day.approvals).toEqual([fastest, sixHours]);
    day[VIA_SERVICE].removeApproval("routeType");
    expect(day.approvals).toEqual([sixHours]);
  });

  it("are refused as stored with two of one kind", () => {
    expect(
      () =>
        new StayDay({
          id: "day_k7m2x9qa",
          ownStartTime: null,
          approvals: [FIVE_HOURS, FIVE_HOURS],
          isRestDay: false,
        }),
    ).toThrow("at most one approval of each kind");
  });

  it("never include an opening hours approval, which only stops hold", () => {
    expect(() => {
      newDay()[VIA_SERVICE].removeApproval("openingHours");
    }).toThrow("Only stops hold them");
    expect(
      new OpeningHoursApproval({ reason: "ok", approvedOpenTimeInMinutes: 0 })
        .kind,
    ).toBe("openingHours");
  });
});

describe("Leg", () => {
  it("adds up its segments' drive times, and never changes its lists", () => {
    const routed = leg();
    expect(routed.driveTimeInMinutes).toBe(130);
    expect(Object.isFrozen(routed.segmentDriveTimesInMinutes)).toBe(true);
    expect(Object.isFrozen(routed.routedWaypoints)).toBe(true);
  });
});
