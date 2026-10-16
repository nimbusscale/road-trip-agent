import { describe, expect, it } from "vitest";

import {
  BIG_SUR,
  FIRST_AWAKENINGS,
  MONTEREY,
  NEPENTHE,
  SAN_LUIS_OBISPO,
} from "./legs.fake.js";
import { milesBetween, withWaypoints } from "./waypoint-placement.js";

describe("withWaypoints", () => {
  it("puts a waypoint in the gap where it adds the least straight-line distance", () => {
    const points = withWaypoints(
      MONTEREY,
      [FIRST_AWAKENINGS],
      SAN_LUIS_OBISPO,
      [BIG_SUR],
    );
    expect(points.map((point) => point.place)).toEqual([
      FIRST_AWAKENINGS,
      BIG_SUR,
    ]);
    expect(points.map((point) => point.isPassThrough)).toEqual([false, true]);
  });

  it("places waypoints one at a time, in the coordinator's order, so an earlier one is a neighbor", () => {
    const points = withWaypoints(MONTEREY, [], SAN_LUIS_OBISPO, [
      NEPENTHE,
      BIG_SUR,
    ]);
    expect(points.map((point) => point.place.name)).toEqual([
      "Big Sur village",
      "Nepenthe",
    ]);
  });

  it("skips a waypoint that's the start or end", () => {
    expect(withWaypoints(MONTEREY, [], SAN_LUIS_OBISPO, [MONTEREY])).toEqual(
      [],
    );
  });

  it("measures straight-line miles", () => {
    // Monterey to Big Sur village, in a straight line.
    expect(Math.round(milesBetween(MONTEREY, BIG_SUR))).toBe(23);
  });
});
