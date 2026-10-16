import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import { namedPlace } from "./itinerary.fake.js";
import { examplePlace } from "./place.fake.js";
import { RuleError } from "./rule-error.js";
import { hasStartedOn, todayAt } from "./today.js";

const MOAB = examplePlace({ latitude: 38.5733, longitude: -109.5498 });
const START_DATE = new CalendarDate(2027, 10, 10);

describe("CalendarDate", () => {
  it("is made from YYYY-MM-DD text, and written back the same", () => {
    const date = CalendarDate.fromText("2027-05-13");
    expect([date.year, date.month, date.day]).toEqual([2027, 5, 13]);
    expect(date.toText()).toBe("2027-05-13");
  });

  it.each(["2027-02-30", "2027-13-01", "27-05-13", "May 13", ""])(
    'refuses "%s"',
    (text) => {
      expect(() => CalendarDate.fromText(text)).toThrow(RuleError);
    },
  );

  it("moves by days, across months and years", () => {
    expect(START_DATE.plusDays(22).toText()).toBe("2027-11-01");
    expect(new CalendarDate(2027, 12, 31).plusDays(1).toText()).toBe(
      "2028-01-01",
    );
  });

  it("counts the days between two dates", () => {
    expect(START_DATE.plusDays(3).compareTo(START_DATE)).toBe(3);
    expect(START_DATE.compareTo(START_DATE.plusDays(3))).toBe(-3);
    expect(START_DATE.equals(new CalendarDate(2027, 10, 10))).toBe(true);
  });

  it("names its month and year, for the trip's name", () => {
    expect(new CalendarDate(2027, 5, 13).monthAndYear).toBe("May 2027");
  });
});

describe("todayAt", () => {
  it("gives today's date in the place's time zone", () => {
    // 8 p.m. in Moab is already the next day in UTC.
    const eightPmInMoab = new Date("2027-10-11T02:00:00Z");
    expect(todayAt(MOAB, eightPmInMoab).toText()).toBe("2027-10-10");
    const losAngeles = examplePlace({ latitude: 34.05, longitude: -118.24 });
    expect(todayAt(losAngeles, eightPmInMoab).toText()).toBe("2027-10-10");
  });
});

describe("hasStartedOn", () => {
  it("is true from the start date on, at the start place", () => {
    const lateTheNightBefore = new Date("2027-10-10T05:59:00Z");
    const justAfterMidnight = new Date("2027-10-10T06:01:00Z");
    expect(hasStartedOn(START_DATE, MOAB, lateTheNightBefore)).toBe(false);
    expect(hasStartedOn(START_DATE, MOAB, justAfterMidnight)).toBe(true);
    expect(hasStartedOn(START_DATE, MOAB, new Date("2028-01-01"))).toBe(true);
  });

  it("is false while there's no start date", () => {
    expect(hasStartedOn(null, namedPlace("Moab"), new Date())).toBe(false);
  });
});
