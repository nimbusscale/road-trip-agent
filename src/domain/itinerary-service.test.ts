import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import { OWNER, placeNamed, planningFor } from "./example-trip-parts.fake.js";
import { examplePlace } from "./place.fake.js";
import { newTrip } from "./trip.js";

// 8 p.m. on October 9, 2027, in Moab, which is 2 a.m. on October 10 in UTC.
const EVENING_IN_MOAB = new Date("2027-10-10T02:00:00Z");

const MOAB = examplePlace({
  name: "Moab",
  googlePlaceId: "google-Moab",
  latitude: 38.5733,
  longitude: -109.5498,
});

// In the Eastern time zone, where it's already 10 p.m. when it's 8 p.m. in Moab. At
// 11 p.m. in Moab, it's 1 a.m. on the next day there.
const PITTSBURGH = examplePlace({
  name: "Pittsburgh",
  googlePlaceId: "google-Pittsburgh",
  latitude: 40.4406,
  longitude: -79.9959,
});

function planningInMoab(now = EVENING_IN_MOAB) {
  const planning = planningFor(newTrip(OWNER, now), now);
  planning.services.itinerary.setStartPlace(planning.itinerary, MOAB);
  return planning;
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
    services.itinerary.setStartPlace(itinerary, placeNamed("Lockhart"));
    services.itinerary.setStartDate(itinerary, new CalendarDate(2030, 1, 1));
    expect(itinerary.startDate?.toText()).toBe("2030-01-01");
  });
});

// 11 p.m. on October 9, 2027, in Moab, which is 1 a.m. on October 10 in Pittsburgh.
const LATE_IN_MOAB = new Date("2027-10-10T05:00:00Z");

describe("ItineraryService.setStartPlace", () => {
  it("sets the start place while there's no start date", () => {
    const { itinerary, services } = planningFor(newTrip(OWNER, LATE_IN_MOAB));
    services.itinerary.setStartPlace(itinerary, PITTSBURGH);
    expect(itinerary.startPlace).toBe(PITTSBURGH);
  });

  it("moves the start place when today there is still before the start date", () => {
    const { itinerary, services } = planningInMoab();
    services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 10));
    services.itinerary.setStartPlace(itinerary, PITTSBURGH);
    expect(itinerary.startPlace).toBe(PITTSBURGH);
  });

  it("refuses a start place where today is already the start date, the same rule as setStartDate", () => {
    const { itinerary, services } = planningInMoab(LATE_IN_MOAB);
    services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 10));
    expect(() => {
      services.itinerary.setStartPlace(itinerary, PITTSBURGH);
    }).toThrow(
      "The start date has to be after today at the start place. Today is Sunday, October 10, 2027 at Pittsburgh, and the start date is Sunday, October 10, 2027, so the trip would start at once. To move the start place there, set a later start date first.",
    );
    expect(itinerary.startPlace).toBe(MOAB);
  });
});
