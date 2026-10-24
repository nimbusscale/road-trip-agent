import { describe, expect, it } from "vitest";

import { RESUMED_LINE } from "./app-lines.js";
import {
  coordinatorPrompt,
  MEMORY_CHANGE_RULE,
  TRIP_CHANGE_RULE,
} from "./coordinator-prompt.js";

describe("coordinatorPrompt", () => {
  // Settings unlike the starting values (14 days, 12 hours, 6 hours), so a number
  // written into the text would show up.
  const prompt = coordinatorPrompt({
    maximumTripLengthDays: 10,
    maximumDailyDrivingHours: 9,
    recommendedDailyDrivingHours: 4,
  });

  it("fills in every limit from the settings, so none goes stale", () => {
    expect(prompt).toContain("The app plans trips of at most 10 days.");
    expect(prompt).toContain(
      "The app plans at most 9 hours of driving in a day, and recommends 4 or less.",
    );
    expect(prompt).toContain('"we can drive 11 hours if we have to."');
    // The memory example's date isn't a setting.
    expect(prompt.replace("February 14", "")).not.toMatch(/\b(6|12|14)\b/);
  });

  it("gives the rules that cover several tools, word for word", () => {
    expect(prompt).toContain(TRIP_CHANGE_RULE);
    expect(prompt).toContain(MEMORY_CHANGE_RULE);
  });

  // Functional spec 5.2: budget posture is the default tier plus any rules.
  it("doesn't ask for budget rules from a user who has none", () => {
    expect(prompt).toContain(
      "Each is required, except restDaysText, usualStartTime, and budgetRulesText.",
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
      "restDaysText",
      "usualStartTime",
      "defaultTier",
      "budgetRulesText",
      "mealPreferencesText",
    ]) {
      expect(prompt).toContain(`- ${item}: `);
    }
  });
});
