import { describe, expect, it } from "vitest";

import { ConfigError } from "./config-error.js";
import { loadSettings, parseSettings, SETTINGS_PATH } from "./settings.js";

const GOOD_SETTINGS = {
  lateAllowanceMinutes: 15,
  stopOrderMinimumSavingMinutes: 15,
  driveBufferPercent: 10,
  alongLegEndDistanceMiles: 2,
  nearDistanceMiles: 15,
  maximumTripLengthDays: 14,
  maximumDailyDrivingHours: 12,
  recommendedDailyDrivingHours: 6,
  mealVisitMinutes: 60,
  maximumMemoryItems: 50,
  maximumMemoryItemCharacters: 300,
};

function parse(settings: object): unknown {
  return parseSettings(JSON.stringify(settings), "test.json");
}

describe("loadSettings", () => {
  it("loads the settings file the app ships with", () => {
    expect(loadSettings(SETTINGS_PATH)).toEqual(GOOD_SETTINGS);
  });

  it("refuses a file that isn't there", () => {
    expect(() => loadSettings("missing.json")).toThrow(
      "Can't read the settings file missing.json.",
    );
  });
});

describe("parseSettings", () => {
  it("returns good settings unchanged", () => {
    expect(parse(GOOD_SETTINGS)).toEqual(GOOD_SETTINGS);
  });

  it("refuses text that isn't JSON", () => {
    expect(() => parseSettings("{", "test.json")).toThrow(
      "The settings file test.json isn't valid JSON.",
    );
  });

  it("names a setting with a bad value", () => {
    const settings = { ...GOOD_SETTINGS, maximumTripLengthDays: 0 };
    expect(() => parse(settings)).toThrow(ConfigError);
    expect(() => parse(settings)).toThrow("- maximumTripLengthDays Too small");
  });

  it("names a missing setting", () => {
    const settings = Object.fromEntries(
      Object.entries(GOOD_SETTINGS).filter(
        ([key]) => key !== "mealVisitMinutes",
      ),
    );
    expect(() => parse(settings)).toThrow("- mealVisitMinutes Invalid input");
  });

  it("refuses a setting it doesn't know, such as a misspelled name", () => {
    expect(() => parse({ ...GOOD_SETTINGS, nearDistanceMile: 15 })).toThrow(
      'Unrecognized key: "nearDistanceMile"',
    );
  });

  it("refuses recommended driving above the maximum", () => {
    const settings = { ...GOOD_SETTINGS, recommendedDailyDrivingHours: 13 };
    expect(() => parse(settings)).toThrow(
      "- recommendedDailyDrivingHours can't be more than maximumDailyDrivingHours",
    );
  });
});
