import { describe, expect, it } from "vitest";

import { meal, placeNamed } from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { exampleWaypoint } from "./place.fake.js";
import {
  BIG_SUR,
  forgetCalls,
  namesOf,
  NEPENTHE,
  sanFranciscoDay2,
  settledMoab,
} from "./legs.fake.js";
import { RuleError } from "./rule-error.js";

describe("LegsService.detourTimesOf", () => {
  it("measures each place at the stop's position, against the leg, and never gives less than 0", async () => {
    const { itinerary, torrey, stops, legs, finder } = await settledMoab();
    finder.driveTimesFor = (path) => {
      const names = namesOf(path);
      if (names.includes("Pie shop")) {
        return [104, 77, 33, 22, 13];
      }
      return names.includes("Pie on the road") ? [100, 50, 20, 20, 10] : null;
    };
    const detours = await legs.detourTimesOf(itinerary, stops.gifford, [
      placeNamed("Pie shop"),
      placeNamed("Pie on the road"),
    ]);
    expect(present(torrey.days[0]?.leg).driveTimeInMinutes).toBe(234);
    expect(detours).toEqual([15, 0]);
    // Each place stands in for Gifford Homestead, between Goblin Valley and Capitol
    // Gorge, and changes nothing.
    expect(finder.routes.map(namesOf)).toEqual(
      ["Pie shop", "Pie on the road"].map((pie) => [
        "Goblin Valley State Park",
        pie,
        "Capitol Gorge",
        "Panorama Point",
      ]),
    );
    expect(stops.gifford.selectedPlace?.name).toBe("Gifford Homestead");
  });

  it("places the waypoints the same way as for the leg", async () => {
    const { itinerary, services, day2, legs, finder } = sanFranciscoDay2();
    await legs.updateLegs(itinerary);
    day2.setWaypoints([exampleWaypoint(BIG_SUR)]);
    await legs.updateLegs(itinerary);
    const lunch = meal({
      purpose: "a view with lunch",
      searchArea: "alongLeg",
    });
    services.stops.addStops(itinerary, day2, [lunch], day2.stops[0] ?? null);
    forgetCalls(finder);
    await legs.detourTimesOf(itinerary, lunch, [NEPENTHE]);
    expect(namesOf(finder.routes[0])).toEqual([
      "First Awakenings",
      "Big Sur village (pass through)",
      "Nepenthe",
    ]);
  });

  it("refuses a stop that isn't along the leg", async () => {
    const { itinerary, stops, legs, finder } = await settledMoab();
    await expect(
      legs.detourTimesOf(itinerary, stops.milts, [placeNamed("Pie shop")]),
    ).rejects.toThrow(
      `Only a stop along the leg has detour times. burgers (${stops.milts.id}) isn't along the leg.`,
    );
    expect(finder.callCount).toBe(0);
  });

  it("refuses while the stop's day has no leg yet", async () => {
    const { itinerary, services, day2, legs } = sanFranciscoDay2();
    const lunch = meal({
      purpose: "a view with lunch",
      searchArea: "alongLeg",
    });
    services.stops.addStops(itinerary, day2, [lunch], null);
    await expect(
      legs.detourTimesOf(itinerary, lunch, [NEPENTHE]),
    ).rejects.toThrow(RuleError);
  });
});
