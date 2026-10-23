import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { AppLines, RESUMED_LINE } from "./app-lines.js";

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

  // Before the trip has a start place, the date is UTC's, which is a day ahead in a US
  // evening. Once a start place is set, the date goes back a day.
  it("adds the date again when it goes back a day", () => {
    const lines = new AppLines(false);
    lines.addTo("Hi!", SATURDAY);
    expect(lines.addTo("We start in Austin.", FRIDAY)).toBe(
      "Today is Friday, October 23, 2026.\n\nWe start in Austin.",
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
