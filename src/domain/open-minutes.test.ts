import { describe, expect, it } from "vitest";

import { ALWAYS_OPEN, openOn } from "./example-trip-parts.fake.js";
import { openMinutesWithin } from "./open-minutes.js";
import { OpeningPeriod } from "./opening-period.js";
import { TimeOfDay } from "./time-of-day.js";
import type { Weekday } from "./weekday.js";

function overnight(openDay: Weekday, closeDay: Weekday): OpeningPeriod {
  return new OpeningPeriod({
    openDay,
    openTime: TimeOfDay.fromText("17:00"),
    closeDay,
    closeTime: TimeOfDay.fromText("02:00"),
  });
}

// Minutes from midnight, such as 13 * 60 for 1 p.m.
function visit(fromHour: number, toHour: number) {
  return { startMinute: fromHour * 60, endMinute: toHour * 60 };
}

describe("openMinutesWithin", () => {
  it("counts a visit that starts at opening time or ends at closing time", () => {
    const hours = [openOn("monday", "06:00", "20:00")];
    expect(openMinutesWithin(hours, "monday", visit(6, 11))).toBe(300);
    expect(openMinutesWithin(hours, "monday", visit(15, 20))).toBe(300);
  });

  it("counts only the part of a visit within the hours", () => {
    const hours = [openOn("monday", "10:30", "12:30")];
    expect(openMinutesWithin(hours, "monday", visit(12, 13))).toBe(30);
    expect(openMinutesWithin(hours, "tuesday", visit(12, 13))).toBe(0);
  });

  it("reads hours past midnight, on the day after", () => {
    const bar = [overnight("monday", "tuesday")];
    // 1 a.m. on Tuesday, from a Monday whose schedule runs past midnight.
    expect(openMinutesWithin(bar, "monday", visit(25, 26))).toBe(60);
    // The same time, from Tuesday's own schedule.
    expect(openMinutesWithin(bar, "tuesday", visit(1, 2))).toBe(60);
    expect(openMinutesWithin(bar, "tuesday", visit(25, 26))).toBe(0);
  });

  it("reads hours that run from Saturday night into Sunday", () => {
    const bar = [overnight("saturday", "sunday")];
    expect(openMinutesWithin(bar, "sunday", visit(1, 3))).toBe(60);
    expect(openMinutesWithin(bar, "saturday", visit(23, 27))).toBe(240 - 60);
  });

  it("counts every minute at a place that's always open", () => {
    expect(openMinutesWithin([ALWAYS_OPEN], "wednesday", visit(23, 26))).toBe(
      180,
    );
  });
});
