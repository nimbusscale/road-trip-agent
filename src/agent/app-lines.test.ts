import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { AppLines, RESUMED_LINE, withoutAppLines } from "./app-lines.js";

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

describe("withoutAppLines", () => {
  it("takes off the lines the app added, leaving the user's own words", () => {
    const lines = new AppLines(true);
    const message = "Five days.\n\nMaybe six.";
    expect(withoutAppLines(lines.addTo(message, FRIDAY))).toBe(message);
  });

  it("leaves a message with no app lines as it is", () => {
    expect(withoutAppLines("Five days.")).toBe("Five days.");
    expect(withoutAppLines("Today is the day.\n\nLet's go.")).toBe(
      "Today is the day.\n\nLet's go.",
    );
  });
});
