import { describe, expect, it } from "vitest";

import type { Calendar } from "./calendar.js";
import type { Itinerary } from "./itinerary.js";
import { moabExample } from "./moab-example.fake.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";
import { StayDay } from "./stay-day.js";

// Both example trips (domain model section 5) are built, laid out, and filled through
// the services, in moabExample() and sanFranciscoExample(). Only their legs are set
// directly, with made-up drive times. These check what the services built. The
// calendar tests check their schedules come out as the examples show.

function shapeOf(calendar: Calendar, itinerary: Itinerary) {
  return itinerary.days.map((day) => ({
    date: calendar.dateOf(itinerary, day)?.toText(),
    location: calendar.locationOf(itinerary, day),
    isRestDay: day instanceof StayDay && day.isRestDay,
    stops: day.stops.map((stop) => stop.selectedPlace?.name),
    approvals: day.approvals.map((approval) => approval.kind),
  }));
}

describe("the example trips, built through the services", () => {
  it("San Francisco has two one-night stays with lodging, and every stop selected", () => {
    const { trip, calendar, monterey, sanLuisObispo } = sanFranciscoExample();
    const itinerary = trip.itinerary;
    expect(itinerary.stays).toEqual([monterey, sanLuisObispo]);
    expect(itinerary.stays.map((stay) => stay.lodging?.name)).toEqual([
      "Monterey hotel",
      "San Luis Obispo hotel",
    ]);
    const days = shapeOf(calendar, itinerary);
    expect(days.map((day) => [day.date, day.location])).toEqual([
      ["2027-05-13", "San Francisco → Monterey"],
      ["2027-05-14", "Monterey → San Luis Obispo"],
      ["2027-05-15", "San Luis Obispo → Mike's house"],
    ]);
    expect(days.map((day) => day.stops.length)).toEqual([5, 7, 0]);
    expect(days.flatMap((day) => day.stops)).not.toContain(undefined);
    expect(days.map((day) => day.approvals)).toEqual([[], [], ["routeType"]]);
  });

  it("Moab has a three-night stay with a rest day, a night in Torrey, and every stop selected", () => {
    const { trip, calendar, moab, torrey } = moabExample();
    const itinerary = trip.itinerary;
    expect(itinerary.stays).toEqual([moab, torrey]);
    expect([moab.nightCount, torrey.nightCount]).toEqual([3, 1]);
    const days = shapeOf(calendar, itinerary);
    expect(days.map((day) => [day.date, day.location])).toEqual([
      ["2027-10-10", "Grand Junction → Moab"],
      ["2027-10-11", "Moab"],
      ["2027-10-12", "Moab"],
      ["2027-10-13", "Moab → Torrey"],
      ["2027-10-14", "Torrey → Salt Lake City"],
    ]);
    expect(days.map((day) => day.isRestDay)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(days.map((day) => day.stops.length)).toEqual([3, 6, 1, 4, 0]);
    expect(days.flatMap((day) => day.stops)).not.toContain(undefined);
    expect(days[3]?.approvals).toEqual(["driveHours"]);
  });
});
