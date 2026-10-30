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
  defaultComfortableDrivingHours: 4,
  mealVisitMinutes: 60,
  checkInVisitMinutes: 30,
  maximumMemoryItems: 50,
  maximumMemoryItemCharacters: 300,
  coordinatorModel: "claude-opus-5-5",
  coordinatorEffort: "medium",
  stayResearcherModel: "claude-sonnet-5-5",
  stayResearcherEffort: "medium",
  legScoutModel: "claude-sonnet-5-5",
  legScoutEffort: "medium",
  weatherWorkerModel: "claude-sonnet-5-5",
  weatherWorkerEffort: "medium",
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

  it("refuses a near distance over Google's 50,000-meter circle, which every search_near would fail on", () => {
    expect(parse({ ...GOOD_SETTINGS, nearDistanceMiles: 31 })).toEqual({
      ...GOOD_SETTINGS,
      nearDistanceMiles: 31,
    });
    expect(() => parse({ ...GOOD_SETTINGS, nearDistanceMiles: 32 })).toThrow(
      "- nearDistanceMiles Too big",
    );
  });

  it("refuses a short model name, which would move to newer models on its own", () => {
    const settings = { ...GOOD_SETTINGS, coordinatorModel: "opus" };
    expect(() => parse(settings)).toThrow(
      "- coordinatorModel must be an exact model ID, such as claude-opus-5-5",
    );
  });

  it("refuses an effort level the Agent SDK doesn't take", () => {
    const settings = { ...GOOD_SETTINGS, stayResearcherEffort: "normal" };
    expect(() => parse(settings)).toThrow(
      "- stayResearcherEffort Invalid option",
    );
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

  it("refuses a default comfortable driving above the maximum", () => {
    const settings = { ...GOOD_SETTINGS, defaultComfortableDrivingHours: 13 };
    expect(() => parse(settings)).toThrow(
      "- defaultComfortableDrivingHours can't be more than maximumDailyDrivingHours",
    );
  });
});
