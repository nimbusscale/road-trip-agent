import { describe, expect, it } from "vitest";

import { at, layOut, meal, placeNamed } from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { exampleWaypoint } from "./place.fake.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";

describe("DaysService.setRestDay", () => {
  it("marks a day that stays put, and keeps its approvals. LegsService removes its leg at the end of the write", () => {
    const { trip, services, moab } = moabExample();
    const day2 = present(moab.days[1]);
    expect(day2.leg).not.toBeNull();
    // Each of Day 2's stops needs a set time first.
    day2.stops.forEach((stop, index) => {
      services.stops.setStopTime(
        trip.itinerary,
        stop,
        stop.setTime ?? at(`1${String(index)}:00`),
      );
    });
    services.days.approveRouteType(day2, "fastest", "short hops");
    services.days.setRestDay(trip.itinerary, day2, true);
    expect(day2.isRestDay).toBe(true);
    expect(day2.leg).not.toBeNull();
    expect(day2.approvals.map((approval) => approval.kind)).toEqual([
      "routeType",
    ]);
  });

  it("unmarks a rest day", () => {
    const { trip, services, moab } = moabExample();
    const day3 = present(moab.days[2]);
    services.days.setRestDay(trip.itinerary, day3, false);
    expect(day3.isRestDay).toBe(false);
  });

  it("refuses a day that moves to a new stay, since it has to drive", () => {
    const { trip, services, moab } = moabExample();
    const day1 = present(moab.days[0]);
    expect(() => {
      services.days.setRestDay(trip.itinerary, day1, true);
    }).toThrow(
      "Only a day that starts and ends at the same stay can be a rest day.",
    );
    expect(day1.isRestDay).toBe(false);
    expect(day1.leg).not.toBeNull();
  });

  it("refuses while a stop on the day has no set time, and lists those stops", () => {
    const { trip, services, moab } = moabExample();
    const day2 = present(moab.days[1]);
    const [, windows, cafe] = day2.stops;
    expect(() => {
      services.days.setRestDay(trip.itinerary, day2, true);
    }).toThrow(
      `Each stop on a rest day needs a set time. Give these one first: arches (${present(windows).id}); café (${present(cafe).id});`,
    );
    expect(day2.isRestDay).toBe(false);
  });

  it("lets a rest day's stops be laid out with set times", () => {
    const { services, moab, trip, calendar } = moabExample();
    const day3 = present(moab.days[2]);
    const planning = { trip, itinerary: trip.itinerary, calendar, services };
    const lunch = meal({
      purpose: "lunch",
      searchArea: "nearStay",
      stay: moab,
      setTime: at("12:00"),
    });
    layOut(planning, day3, [lunch]);
    expect(day3.stops).toHaveLength(2);
  });
});

describe("DaysService approvals", () => {
  it("adds a drive hours approval, replacing the one the day had", () => {
    const { services, torrey } = moabExample();
    const day4 = present(torrey.days[0]);
    services.days.approveDriveHours(day4, 6, "a long day is fine");
    expect(day4.approvals).toEqual([
      expect.objectContaining({
        kind: "driveHours",
        approvedDrivingInHours: 6,
        reason: "a long day is fine",
      }),
    ]);
  });

  it("refuses drive hours over the maximum daily driving, and gives the limit", () => {
    const { services, torrey } = moabExample();
    const day4 = present(torrey.days[0]);
    expect(() => {
      services.days.approveDriveHours(day4, 13, "we love driving");
    }).toThrow(
      "A day's driving is at most 12 hours, so an approval can't go over it. It was given 13.",
    );
    expect(day4.approvals[0]).toMatchObject({ approvedDrivingInHours: 5 });
  });

  it("refuses by the approval's own rules: an empty reason, or hours that aren't more than 0", () => {
    const { services, torrey } = moabExample();
    const day4 = present(torrey.days[0]);
    expect(() => {
      services.days.approveDriveHours(day4, 6, "");
    }).toThrow("An approval needs the user's reason.");
    expect(() => {
      services.days.approveDriveHours(day4, 0, "fine");
    }).toThrow("A drive hours approval's hours have to be more than 0.");
    expect(() => {
      services.days.approveRouteType(day4, "fastest", " ");
    }).toThrow("An approval needs the user's reason.");
  });

  it("adds a route type approval, and removes an approval by kind", () => {
    const { trip, services } = sanFranciscoExample();
    const lastDay = trip.itinerary.lastDay;
    expect(lastDay.approvals[0]).toMatchObject({
      approvedRouteType: "fastest",
    });
    services.days.removeApproval(lastDay, "routeType");
    expect(lastDay.approvals).toEqual([]);
    services.days.removeApproval(lastDay, "driveHours");
    expect(lastDay.approvals).toEqual([]);
  });

  it("refuses to remove an opening hours approval from a day, which only stops hold", () => {
    const { trip, services } = sanFranciscoExample();
    expect(() => {
      services.days.removeApproval(trip.itinerary.lastDay, "openingHours");
    }).toThrow("A day holds no opening hours approval. Only stops hold them.");
  });
});

describe("DaysService.approveRouteType: waypoints", () => {
  it("approving scenic leaves the day's waypoints, and approving fastest clears them and returns them", () => {
    const { trip, services } = sanFranciscoExample();
    const day2 = present(trip.itinerary.days[1]);
    const bigSur = present(day2.waypoints[0]);
    expect(services.days.approveRouteType(day2, "scenic", "the coast")).toEqual(
      [],
    );
    expect(day2.waypoints).toEqual([bigSur]);
    expect(
      services.days.approveRouteType(day2, "fastest", "running late"),
    ).toEqual([bigSur]);
    expect(day2.waypoints).toEqual([]);
    expect(
      services.days.approveRouteType(day2, "fastest", "still late"),
    ).toEqual([]);
  });

  it("clears them on a day marked a rest day in the same write, which keeps its leg until the end of the write", () => {
    const { trip, services, moab } = moabExample();
    const day2 = present(moab.days[1]);
    const arches = exampleWaypoint(placeNamed("Arches viewpoint"));
    day2.setWaypoints([arches]);
    day2.stops.forEach((stop, index) => {
      services.stops.setStopTime(
        trip.itinerary,
        stop,
        stop.setTime ?? at(`1${String(index)}:00`),
      );
    });
    services.days.setRestDay(trip.itinerary, day2, true);
    expect(
      services.days.approveRouteType(day2, "fastest", "short hops"),
    ).toEqual([arches]);
    expect(day2.waypoints).toEqual([]);
  });
});
