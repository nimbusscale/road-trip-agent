import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { decodeRouteLine } from "./route-line.js";
import { routesResponseSchema } from "./routes.schema.js";

describe("decodeRouteLine", () => {
  // Google's own example of the format.
  it("decodes each point, including negative changes", () => {
    expect(decodeRouteLine("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("decodes a saved route from Monterey to San Luis Obispo end to end", () => {
    const route = routesResponseSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            "saved-responses/route-through-big-sur.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const points = decodeRouteLine(route?.polyline.encodedPolyline ?? "");
    expect(points[0]?.latitude).toBeCloseTo(36.6, 1);
    expect(points[0]?.longitude).toBeCloseTo(-121.9, 1);
    expect(points.at(-1)?.latitude).toBeCloseTo(35.28, 1);
    expect(points.at(-1)?.longitude).toBeCloseTo(-120.66, 1);
  });

  it("refuses a line that ends partway through a point", () => {
    expect(() => decodeRouteLine("_p~iF~ps|")).toThrow(RangeError);
  });

  it("gives no points for an empty line", () => {
    expect(decodeRouteLine("")).toEqual([]);
  });
});
