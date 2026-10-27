import { describe, expect, it } from "vitest";

import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { examplePlace } from "../domain/place.fake.js";
import { readablePlanOf, storedPlanOf } from "./plan-downloads.js";

const OWNER = { id: "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f" };

describe("the plan's downloads", () => {
  it("gives the stored plan with only the places it links to", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const unlinked = examplePlace({ name: "A search result never chosen" });
    const stored = JSON.stringify(storedPlanOf(trip, [...places, unlinked]));
    for (const place of places) {
      expect(stored).toContain(`"id":"${place.id}"`);
    }
    expect(stored).not.toContain(unlinked.id);
    expect(stored).toContain('"routeLine":"_p~iF~ps|U_ulLnnqC"');
    expect(stored).toContain('"openTime":');
  });

  it("puts each place's name and address where the readable plan links to it, and leaves out route lines", () => {
    const { trip, places, moab } = exampleMoabTrip(OWNER);
    const readable = readablePlanOf(trip, places);
    const text = JSON.stringify(readable);
    for (const place of places) {
      expect(text).not.toContain(place.id);
    }
    expect(text).not.toContain("routeLine");
    const shownMoab = { name: moab.place.name, address: moab.place.address };
    expect(readable).toMatchObject({
      tripBrief: { focus: "Arches and Capitol Reef" },
      itinerary: {
        stays: [{ id: moab.id, place: shownMoab }, {}],
        rejectedPlaces: [{ reason: "too kitschy for us" }],
      },
    });
  });

  it("keeps the names of links that are empty", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const readable = JSON.stringify(readablePlanOf(trip, places));
    expect(readable).toContain('"selectedPlaceId":null');
  });

  it("gives each waypoint's place with its reason, and each place a leg was routed through", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const readable = JSON.stringify(readablePlanOf(trip, places));
    expect(readable).toContain('"waypoints":[{"place":{"name":"Dewey Bridge",');
    expect(readable).toContain('"reason":"steer onto UT-128"');
    expect(readable).toContain('"routedWaypoints":[{"name":"Dewey Bridge",');
  });
});
