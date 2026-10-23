import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { examplePlace } from "../domain/place.fake.js";
import { AppLines, coordinatorToday, RESUMED_LINE } from "./app-lines.js";

const FRIDAY = new CalendarDate(2026, 10, 23);
const SATURDAY = new CalendarDate(2026, 10, 24);

describe("AppLines", () => {
  it("adds today's date to the first message, and not again on the same date", () => {
    const lines = new AppLines(false);
    expect(lines.addTo("Hi!", FRIDAY)).toBe(
      "Today is Friday, October 23, 2026.\n\nHi!",
    );
    expect(lines.addTo("Five days.", FRIDAY)).toBe("Five days.");
  });

  it("adds the date again on a later date", () => {
    const lines = new AppLines(false);
    lines.addTo("Hi!", FRIDAY);
    expect(lines.addTo("Back again.", SATURDAY)).toBe(
      "Today is Saturday, October 24, 2026.\n\nBack again.",
    );
  });

  it("adds the resumed line to the first message after a resume only", () => {
    const lines = new AppLines(true);
    expect(lines.addTo("Where were we?", FRIDAY)).toBe(
      `Today is Friday, October 23, 2026.\n${RESUMED_LINE}\n\nWhere were we?`,
    );
    expect(lines.addTo("Five days.", FRIDAY)).toBe("Five days.");
  });
});

describe("coordinatorToday", () => {
  // 11 p.m. on Friday in Texas is already Saturday in UTC.
  const fridayNightInTexas = new Date("2026-10-24T04:00:00Z");

  it("is the date in UTC until the trip has a start place", () => {
    expect(coordinatorToday(null, fridayNightInTexas)).toEqual(SATURDAY);
  });

  it("is the date at the start place once it has one", () => {
    expect(coordinatorToday(examplePlace(), fridayNightInTexas)).toEqual(
      FRIDAY,
    );
  });
});
