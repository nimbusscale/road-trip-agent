import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import { examplePlace } from "./place.fake.js";
import { tripToday } from "./today.js";

describe("tripToday", () => {
  // 11 p.m. on Friday in Texas is already Saturday in UTC.
  const fridayNightInTexas = new Date("2026-10-24T04:00:00Z");

  it("is the date in UTC until the trip has a start place", () => {
    expect(tripToday(null, fridayNightInTexas)).toEqual(
      new CalendarDate(2026, 10, 24),
    );
  });

  it("is the date at the start place once it has one", () => {
    expect(tripToday(examplePlace(), fridayNightInTexas)).toEqual(
      new CalendarDate(2026, 10, 23),
    );
  });
});
