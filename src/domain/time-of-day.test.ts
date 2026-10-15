import { describe, expect, it } from "vitest";

import { RuleError } from "./rule-error.js";
import { EIGHT_A_M, TimeOfDay } from "./time-of-day.js";

describe("TimeOfDay", () => {
  it("is made from HH:MM text on a 24-hour clock, and written back the same", () => {
    const time = TimeOfDay.fromText("13:05");
    expect(time.hours).toBe(13);
    expect(time.minutes).toBe(5);
    expect(time.toText()).toBe("13:05");
    expect(EIGHT_A_M.toText()).toBe("08:00");
  });

  it.each(["8:00", "24:00", "12:60", "1 p.m.", ""])('refuses "%s"', (text) => {
    expect(() => TimeOfDay.fromText(text)).toThrow(RuleError);
  });

  it("refuses hours or minutes out of range", () => {
    expect(() => new TimeOfDay(24, 0)).toThrow("0 to 23");
    expect(() => new TimeOfDay(7, 2.5)).toThrow("0 to 59");
  });

  it("compares two times", () => {
    const sunrise = TimeOfDay.fromText("05:30");
    expect(sunrise.compareTo(EIGHT_A_M)).toBeLessThan(0);
    expect(EIGHT_A_M.compareTo(sunrise)).toBeGreaterThan(0);
    expect(EIGHT_A_M.equals(new TimeOfDay(8, 0))).toBe(true);
    expect(EIGHT_A_M.equals(sunrise)).toBe(false);
  });
});
