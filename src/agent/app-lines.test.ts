import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import {
  AppLines,
  FORGOTTEN_LINE,
  RESUMED_LINE,
  withoutAppLines,
} from "./app-lines.js";

const FRIDAY = new CalendarDate(2026, 10, 23);
const SATURDAY = new CalendarDate(2026, 10, 24);

describe("AppLines", () => {
  it("adds today's date to the first message, and not again on the same date", () => {
    const lines = new AppLines(false);
    expect(lines.addTo("Hi!", FRIDAY, null)).toBe(
      "Today is Friday, October 23, 2026.\n\nHi!",
    );
    expect(lines.addTo("Five days.", FRIDAY, null)).toBe("Five days.");
  });

  it("adds the date again on a later date", () => {
    const lines = new AppLines(false);
    lines.addTo("Hi!", FRIDAY, null);
    expect(lines.addTo("Back again.", SATURDAY, null)).toBe(
      "Today is Saturday, October 24, 2026.\n\nBack again.",
    );
  });

  // Before the trip has a start place, the date is UTC's, which is a day ahead in a US
  // evening. Once a start place is set, the date goes back a day.
  it("adds the date again when it goes back a day", () => {
    const lines = new AppLines(false);
    lines.addTo("Hi!", SATURDAY, null);
    expect(lines.addTo("We start in Austin.", FRIDAY, null)).toBe(
      "Today is Friday, October 23, 2026.\n\nWe start in Austin.",
    );
  });

  it("adds the resumed line to the first message after a resume only", () => {
    const lines = new AppLines(true);
    expect(lines.addTo("Where were we?", FRIDAY, null)).toBe(
      `Today is Friday, October 23, 2026.\n${RESUMED_LINE}\n\nWhere were we?`,
    );
    expect(lines.addTo("Five days.", FRIDAY, null)).toBe("Five days.");
  });

  it("adds an option card's IDs to the message sent from it, after the other lines", () => {
    const lines = new AppLines(true);
    const card = { holderId: "stay_k7m2x9qa", placeId: "place_p3w8n4rt" };
    expect(lines.addTo("Select Red Cliffs Lodge.", FRIDAY, card)).toBe(
      `Today is Friday, October 23, 2026.\n${RESUMED_LINE}\nFrom an option card: stay_k7m2x9qa, place_p3w8n4rt.\n\nSelect Red Cliffs Lodge.`,
    );
    expect(
      lines.addTo("More options.", FRIDAY, {
        holderId: "stop_k7m2x9qa",
        placeId: null,
      }),
    ).toBe("From an option card: stop_k7m2x9qa.\n\nMore options.");
  });

  it("adds the forgotten line to the first message after the user forgets memory items", () => {
    const lines = new AppLines(false);
    lines.addTo("Hi!", FRIDAY, null);
    lines.markMemoryForgotten();
    lines.markMemoryForgotten();
    expect(lines.addTo("Five days.", FRIDAY, null)).toBe(
      `${FORGOTTEN_LINE}\n\nFive days.`,
    );
    expect(lines.addTo("Six days.", FRIDAY, null)).toBe("Six days.");
  });
});

describe("withoutAppLines", () => {
  it("takes off the lines the app added, leaving the user's own words", () => {
    const lines = new AppLines(true);
    lines.markMemoryForgotten();
    const message = "Five days.\n\nMaybe six.";
    const card = { holderId: "stop_k7m2x9qa", placeId: null };
    expect(withoutAppLines(lines.addTo(message, FRIDAY, card))).toBe(message);
  });

  it("leaves a message with no app lines as it is", () => {
    expect(withoutAppLines("Five days.")).toBe("Five days.");
    expect(withoutAppLines("Today is the day.\n\nLet's go.")).toBe(
      "Today is the day.\n\nLet's go.",
    );
  });
});
