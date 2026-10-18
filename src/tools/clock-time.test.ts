import { describe, expect, it } from "vitest";

import { TimeOfDay } from "../domain/time-of-day.js";
import { clockTextOf, timeOfDayFromClockText } from "./clock-time.js";

describe("clock times", () => {
  it.each([
    ["8:00 a.m.", "08:00"],
    ["12:00 a.m.", "00:00"],
    ["12:30 p.m.", "12:30"],
    ["1:30 p.m.", "13:30"],
    ["11:59 p.m.", "23:59"],
  ])("reads %s as %s", (text, stored) => {
    expect(timeOfDayFromClockText(text).toText()).toBe(stored);
  });

  it("writes a time of day back the same way", () => {
    expect(clockTextOf(new TimeOfDay(0, 5))).toBe("12:05 a.m.");
    expect(clockTextOf(new TimeOfDay(13, 30))).toBe("1:30 p.m.");
  });

  it("refuses text that isn't a clock time", () => {
    expect(() => timeOfDayFromClockText("13:00")).toThrow(TypeError);
  });
});
