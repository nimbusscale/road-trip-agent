import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import { OWNER, placeNamed, planningFor } from "./example-trip-parts.fake.js";
import { examplePlace } from "./place.fake.js";
import { newTrip } from "./trip.js";

// 8 p.m. on October 9, 2027, in Moab, which is 2 a.m. on October 10 in UTC.
const EVENING_IN_MOAB = new Date("2027-10-10T02:00:00Z");

function planningInMoab() {
  const trip = newTrip(OWNER, EVENING_IN_MOAB);
  trip.itinerary.startPlace = examplePlace({
    name: "Moab",
    googlePlaceId: "google-Moab",
    latitude: 38.5733,
    longitude: -109.5498,
  });
  return planningFor(trip, EVENING_IN_MOAB);
}

describe("ItineraryService.setStartDate", () => {
  it("sets a start date after today, and every day's date moves with it", () => {
    const { itinerary, calendar, services } = planningInMoab();
    services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 10));
    expect(itinerary.startDate?.toText()).toBe("2027-10-10");
    expect(calendar.dateOf(itinerary, itinerary.lastDay)?.toText()).toBe(
      "2027-10-10",
    );
  });

  it("refuses today, in the start place's time zone, and gives today's date", () => {
    const { itinerary, services } = planningInMoab();
    expect(() => {
      services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 9));
    }).toThrow(
      "The start date has to be after today, Saturday, October 9, 2027, at the start place. It was given Saturday, October 9, 2027.",
    );
    expect(itinerary.startDate).toBeNull();
  });

  it("refuses a date before today", () => {
    const { itinerary, services } = planningInMoab();
    expect(() => {
      services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 1, 1));
    }).toThrow("The start date has to be after today");
  });

  it("refuses a start date while there's no start place, by the itinerary's own rule", () => {
    const { itinerary, services } = planningFor(newTrip(OWNER, new Date()));
    expect(() => {
      services.itinerary.setStartDate(itinerary, new CalendarDate(2030, 1, 1));
    }).toThrow("The itinerary needs a start place before a start date");
  });

  it("goes by the start place set in the same write", () => {
    const { itinerary, services } = planningFor(newTrip(OWNER, new Date()));
    itinerary.startPlace = placeNamed("Lockhart");
    services.itinerary.setStartDate(itinerary, new CalendarDate(2030, 1, 1));
    expect(itinerary.startDate?.toText()).toBe("2030-01-01");
  });
});
