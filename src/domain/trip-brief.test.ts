import { describe, expect, it } from "vitest";

import { RuleError } from "./rule-error.js";
import { TimeOfDay } from "./time-of-day.js";
import {
  DEFAULT_USUAL_START_TIME,
  TripBrief,
  type TripBriefFields,
} from "./trip-brief.js";
import { TripBriefService } from "./trip-brief-service.js";
import { VIA_SERVICE } from "./via-service.js";

const EMPTY_BRIEF: TripBriefFields = {
  id: "brief_k7m2x9qa",
  focus: null,
  tripLengthInDays: null,
  interestsText: null,
  mustSeesText: null,
  comfortableDrivingInHours: 4,
  routePreference: null,
  usualStartTime: DEFAULT_USUAL_START_TIME,
  mealPreferencesText: null,
  lodgingPreferencesText: null,
};

const SERVICE = new TripBriefService({
  maximumTripLengthDays: 14,
  maximumDailyDrivingHours: 12,
});

const TEXT_ITEMS = [
  "focus",
  "interestsText",
  "mustSeesText",
  "mealPreferencesText",
  "lodgingPreferencesText",
] as const;

function emptyBrief(): TripBrief {
  return new TripBrief(EMPTY_BRIEF);
}

describe("TripBrief", () => {
  it("starts empty, except for the items with a default", () => {
    const brief = emptyBrief();
    expect(brief.focus).toBeNull();
    expect(brief.tripLengthInDays).toBeNull();
    expect(brief.usualStartTime.toText()).toBe("08:00");
  });

  it.each(TEXT_ITEMS)("changes %s, but never empties it", (item) => {
    const brief = emptyBrief();
    brief[item] = "Pacific Coast Highway";
    brief[item] = "Texas barbecue";
    expect(brief[item]).toBe("Texas barbecue");
    expect(() => (brief[item] = null)).toThrow(RuleError);
    expect(() => (brief[item] = "  ")).toThrow("can't be empty");
    expect(brief[item]).toBe("Texas barbecue");
  });

  it("changes routePreference, but never empties it", () => {
    const brief = emptyBrief();
    brief.routePreference = "scenic";
    expect(() => (brief.routePreference = null)).toThrow(RuleError);
    expect(brief.routePreference).toBe("scenic");
  });

  it("changes its usual start time", () => {
    const brief = emptyBrief();
    brief.usualStartTime = TimeOfDay.fromText("05:30");
    expect(brief.usualStartTime.toText()).toBe("05:30");
  });

  it("refuses to be created breaking its own rules", () => {
    expect(() => new TripBrief({ ...EMPTY_BRIEF, focus: "" })).toThrow(
      RuleError,
    );
    expect(
      () => new TripBrief({ ...EMPTY_BRIEF, tripLengthInDays: 0 }),
    ).toThrow(RuleError);
    expect(
      () => new TripBrief({ ...EMPTY_BRIEF, comfortableDrivingInHours: 0 }),
    ).toThrow(RuleError);
  });

  it("runs its own rules in the change methods only services reach", () => {
    const brief = emptyBrief();
    expect(() => {
      brief[VIA_SERVICE].setTripLengthInDays(2.5);
    }).toThrow("whole number");
    expect(() => {
      brief[VIA_SERVICE].setComfortableDrivingInHours(-1);
    }).toThrow("more than 0");
  });
});

describe("TripBriefService", () => {
  it("sets the trip length up to the maximum", () => {
    const brief = emptyBrief();
    SERVICE.setTripLength(brief, 14);
    expect(brief.tripLengthInDays).toBe(14);
  });

  it("refuses a trip length over the maximum, and gives the limit", () => {
    const brief = emptyBrief();
    SERVICE.setTripLength(brief, 5);
    expect(() => {
      SERVICE.setTripLength(brief, 15);
    }).toThrow("tripLengthInDays is at most 14");
    expect(brief.tripLengthInDays).toBe(5);
  });

  it("refuses a trip length under 1, by the brief's own rule", () => {
    expect(() => {
      SERVICE.setTripLength(emptyBrief(), 0);
    }).toThrow("at least 1");
  });

  it("sets comfortable driving up to the maximum", () => {
    const brief = emptyBrief();
    SERVICE.setComfortableDriving(brief, 6.5);
    expect(brief.comfortableDrivingInHours).toBe(6.5);
  });

  it("refuses comfortable driving over the maximum, and gives the limit", () => {
    expect(() => {
      SERVICE.setComfortableDriving(emptyBrief(), 12.5);
    }).toThrow("comfortableDrivingInHours is at most 12");
  });

  it("refuses comfortable driving of 0, by the brief's own rule", () => {
    expect(() => {
      SERVICE.setComfortableDriving(emptyBrief(), 0);
    }).toThrow("more than 0");
  });
});
