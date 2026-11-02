import { describe, expect, it } from "vitest";

import { jsonDifferences, lineDifferences } from "./differences.js";

describe("lineDifferences", () => {
  it("lists only the lines each reply has that the other doesn't, in order", () => {
    const recorded =
      "focus: not set\ncomfortableDrivingInHours: not set\nrestDaysText: not set\nusualStartTime: 8:00 a.m.";
    const today =
      "focus: not set\ncomfortableDrivingInHours: 4\nusualStartTime: 8:00 a.m.";

    expect(lineDifferences(recorded, today)).toEqual([
      "+ comfortableDrivingInHours: 4",
      "- comfortableDrivingInHours: not set",
      "- restDaysText: not set",
    ]);
  });

  it("is empty when the replies match", () => {
    expect(lineDifferences("a\nb", "a\nb")).toEqual([]);
  });
});

describe("jsonDifferences", () => {
  it("gives the path and both values of each difference, and marks a missing value", () => {
    const live = { itinerary: { stays: [{ nightCount: 2 }] }, a: 1 };
    const rebuilt = {
      itinerary: { stays: [{ nightCount: 3 }, { nightCount: 1 }] },
    };

    expect(jsonDifferences(live, rebuilt)).toEqual([
      "itinerary.stays[0].nightCount: 2 → 3",
      'itinerary.stays[1]: missing → {"nightCount":1}',
      "a: 1 → missing",
    ]);
  });
});
