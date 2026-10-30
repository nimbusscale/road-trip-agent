import { describe, expect, it } from "vitest";

import { RESUMED_LINE } from "./app-lines.js";
import {
  coordinatorPrompt,
  MEMORY_CHANGE_RULE,
  TRIP_CHANGE_RULE,
} from "./coordinator-prompt.js";

describe("coordinatorPrompt", () => {
  // Settings unlike settings.json's, so each sentence below shows its number was
  // filled in from the settings.
  const prompt = coordinatorPrompt({
    maximumTripLengthDays: 10,
    maximumDailyDrivingHours: 9,
    recommendedDailyDrivingHours: 7,
    defaultComfortableDrivingHours: 3,
  });

  it("fills in every limit from the settings, so none goes stale", () => {
    expect(prompt).toContain("The app plans trips of at most 10 days.");
    expect(prompt).toContain(
      "The app plans at most 9 hours of driving in a day, and recommends 7 or less.",
    );
    expect(prompt).toContain("comfortableDrivingInHours starts at 3 hours");
    expect(prompt).toContain("It's 3 hours until the user says otherwise");
    expect(prompt).toContain('"we can drive 11 hours if we have to."');
  });

  it("gives the rules that cover several tools, word for word", () => {
    expect(prompt).toContain(TRIP_CHANGE_RULE);
    expect(prompt).toContain(MEMORY_CHANGE_RULE);
  });

  // Functional spec 5.2: lodging preferences are required, like meal preferences.
  it("asks for every item but the two that start with a default", () => {
    expect(prompt).toContain(
      "Each is required, except comfortableDrivingInHours and usualStartTime, which start with a default.",
    );
  });

  it("quotes the resumed line as the app adds it", () => {
    expect(prompt).toContain(`"${RESUMED_LINE}"`);
  });

  it("names every trip brief item as the tools do", () => {
    for (const item of [
      "focus",
      "tripLengthInDays",
      "interestsText",
      "mustSeesText",
      "comfortableDrivingInHours",
      "routePreference",
      "usualStartTime",
      "mealPreferencesText",
      "lodgingPreferencesText",
    ]) {
      expect(prompt).toContain(`- ${item}: `);
    }
  });
});
