import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { decodeRouteLine } from "../google/route-line.js";
import { routesResponseSchema } from "../google/routes.schema.js";
import { LegPosition } from "./leg-position.js";
import { milesBetween } from "./search-result-lines.js";

// Google's route from Salt Lake City to Wendover, UT, on 2026-10-26, asked for the way
// routes-client.ts asks. It's 121 miles, mostly I-80 across the salt flats, and its line
// has 420 points. Where the road runs straight, the points are up to 5.4 miles apart.
const STRAIGHT_ROUTE = present(
  routesResponseSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../google/saved-responses/route-salt-lake-city-to-wendover.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  ),
).polyline.encodedPolyline;

describe("LegPosition", () => {
  it("measures how far off the route to the road between two points, not to the nearest point", () => {
    const points = decodeRouteLine(STRAIGHT_ROUTE);
    const gaps = points.slice(1).map((point, index) => ({
      index,
      miles: milesBetween(points[index] ?? point, point),
    }));
    const widest = gaps.reduce((most, gap) =>
      gap.miles > most.miles ? gap : most,
    );
    const before = points[widest.index];
    const after = points[widest.index + 1];
    if (before === undefined || after === undefined) {
      throw new Error("The saved route has too few points.");
    }
    expect(widest.miles).toBeGreaterThan(5);
    // On I-80, halfway between the two points farthest apart.
    const onTheRoad = {
      latitude: (before.latitude + after.latitude) / 2,
      longitude: (before.longitude + after.longitude) / 2,
    };

    const position = new LegPosition(STRAIGHT_ROUTE).of(onTheRoad);

    expect(position.milesOff).toBeLessThan(0.1);
    const ofBefore = new LegPosition(STRAIGHT_ROUTE).of(before);
    const ofAfter = new LegPosition(STRAIGHT_ROUTE).of(after);
    expect(position.share).toBeCloseTo((ofBefore.share + ofAfter.share) / 2, 3);
  });

  it("puts every place at the start of a route of one point", () => {
    // Google's line for a route to the same place has one point (Google design 2.3).
    const position = new LegPosition("_p~iF~ps|U").of({
      latitude: 38.6,
      longitude: -120.2,
    });

    expect(position.share).toBe(0);
    expect(position.milesOff).toBeCloseTo(
      milesBetween(
        { latitude: 38.5, longitude: -120.2 },
        {
          latitude: 38.6,
          longitude: -120.2,
        },
      ),
      3,
    );
  });
});
