import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import {
  calendarFor,
  OWNER,
  EXAMPLE_SETTINGS,
} from "./example-trip-parts.fake.js";
import { namedPlace, present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { RuleError } from "./rule-error.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";
import { newStay } from "./stay.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip } from "./trip.js";

describe("the calendar's lookups", () => {
  it("starts San Francisco Day 2 at the Monterey stay", () => {
    const { trip, calendar, monterey, sanLuisObispo } = sanFranciscoExample();
    const itinerary = trip.itinerary;
    const day1 = present(itinerary.days[0]);
    const day2 = present(itinerary.days[1]);
    const day3 = present(itinerary.days[2]);
    expect(calendar.startStayOf(itinerary, day2)).toBe(monterey);
    expect(calendar.endStayOf(itinerary, day2)).toBe(sanLuisObispo);
    expect(calendar.fromPlaceOf(itinerary, day2)?.name).toBe("Monterey hotel");
    expect(calendar.toPlaceOf(itinerary, day2)?.name).toBe(
      "San Luis Obispo hotel",
    );
    expect(calendar.startStayOf(itinerary, day1)).toBeNull();
    expect(calendar.fromPlaceOf(itinerary, day1)).toBe(itinerary.startPlace);
    expect(calendar.endStayOf(itinerary, day3)).toBeNull();
    expect(calendar.toPlaceOf(itinerary, day3)?.name).toBe("Mike's house");
  });

  it("knows which days stay put", () => {
    const { trip, calendar } = moabExample();
    const itinerary = trip.itinerary;
    const stayingPut = itinerary.days.map((day) =>
      calendar.isStayingPut(itinerary, day),
    );
    expect(stayingPut).toEqual([false, true, true, false, false]);
  });

  it("gives each day's date, and each stay's dates", () => {
    const { trip, calendar, moab } = moabExample();
    const itinerary = trip.itinerary;
    const day2 = present(itinerary.days[1]);
    expect(calendar.dateOf(itinerary, day2)?.toText()).toBe("2027-10-11");
    expect(
      calendar.datesOf(itinerary, moab).map((date) => date.toText()),
    ).toEqual(["2027-10-10", "2027-10-11", "2027-10-12", "2027-10-13"]);
  });

  it("has no dates while there's no start date", () => {
    const trip = newTrip(OWNER, new Date(), EXAMPLE_SETTINGS);
    const calendar = calendarFor(trip);
    expect(calendar.dateOf(trip.itinerary, trip.itinerary.lastDay)).toBeNull();
  });

  it("finds a stop's day and order, and the days around a day", () => {
    const { trip, calendar, torrey, stops } = moabExample();
    const itinerary = trip.itinerary;
    const day4 = present(torrey.days[0]);
    expect(calendar.dayOf(itinerary, stops.panoramaPoint)).toBe(day4);
    expect(calendar.orderOf(itinerary, stops.panoramaPoint)).toBe(3);
    expect(calendar.orderOf(itinerary, day4)).toBe(3);
    expect(calendar.orderOf(itinerary, torrey)).toBe(1);
    expect(calendar.previousDay(itinerary, present(itinerary.days[0]))).toBe(
      null,
    );
    expect(calendar.nextDay(itinerary, day4)).toBe(itinerary.lastDay);
    expect(calendar.nextDay(itinerary, itinerary.lastDay)).toBeNull();
  });

  it("refuses a stay, day, or stop that isn't in the itinerary", () => {
    const { trip, calendar } = moabExample();
    const elsewhere = newStay({
      place: namedPlace("Green River"),
      nightCount: 1,
    });
    expect(() => calendar.orderOf(trip.itinerary, elsewhere)).toThrow(
      RuleError,
    );
    expect(() =>
      calendar.dateOf(trip.itinerary, present(elsewhere.days[0])),
    ).toThrow("The itinerary has no day");
  });

  it("gives the day's own start time, or the trip brief's", () => {
    const { trip, calendar } = moabExample();
    const itinerary = trip.itinerary;
    const day1 = present(itinerary.days[0]);
    const day2 = present(itinerary.days[1]);
    expect(calendar.startTimeOf(itinerary, day2).toText()).toBe("05:30");
    expect(calendar.startTimeOf(itinerary, day1).toText()).toBe("08:00");
    trip.tripBrief.usualStartTime = TimeOfDay.fromText("07:15");
    expect(calendar.startTimeOf(itinerary, day1).toText()).toBe("07:15");
  });

  it("names the towns each day runs between", () => {
    const sanFrancisco = sanFranciscoExample();
    const sf = sanFrancisco.trip.itinerary;
    expect(
      sf.days.map((day) => sanFrancisco.calendar.locationOf(sf, day)),
    ).toEqual([
      "San Francisco → Monterey",
      "Monterey → San Luis Obispo",
      "San Luis Obispo → Mike's house",
    ]);
    const moab = moabExample();
    const day2 = present(moab.trip.itinerary.days[1]);
    expect(moab.calendar.locationOf(moab.trip.itinerary, day2)).toBe("Moab");
    const newOne = newTrip(OWNER, new Date(), EXAMPLE_SETTINGS);
    expect(
      calendarFor(newOne).locationOf(
        newOne.itinerary,
        newOne.itinerary.lastDay,
      ),
    ).toBeNull();
  });
});

describe("the calendar's today()", () => {
  it("gives today's date at the start place, which UTC is already past at 8 p.m. in Moab", () => {
    const { trip } = moabExample();
    // 8 p.m. on October 10 in Moab and Grand Junction is 2 a.m. on October 11 in UTC.
    const eightPmInMoab = new Date("2027-10-11T02:00:00Z");
    expect(eightPmInMoab.toISOString().startsWith("2027-10-11")).toBe(true);
    const today = calendarFor(trip, eightPmInMoab).today(trip.itinerary);
    expect(today?.equals(new CalendarDate(2027, 10, 10))).toBe(true);
  });

  it("is empty while there's no start place", () => {
    const trip = newTrip(OWNER, new Date(), EXAMPLE_SETTINGS);
    expect(calendarFor(trip).today(trip.itinerary)).toBeNull();
  });
});
