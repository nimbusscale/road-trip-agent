import { describe, expect, it } from "vitest";

import { placeNamed } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import { NAME_MATCH_FIELD_MASK } from "../google/places-client.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { computeRouteTool } from "./route-tools.js";
import { fakeRoutingAccess } from "./routing-session.fake.js";
import { textOf } from "./stored-trip.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// Google Places' best match for each plain name, by the text sent. A name it has no
// match for gets {}, as Google answers.
const MATCHES: Record<string, object> = {
  "Moab, UT": {
    id: "google-moab",
    displayName: { text: "Moab" },
    formattedAddress: "Moab, UT 84532, USA",
  },
  "Dewey Bridge, UT": {
    id: "google-slc",
    displayName: { text: "Salt Lake City" },
    formattedAddress: "Salt Lake City, UT, USA",
  },
};

// compute_route for a trip with Grand Junction and Torrey saved, with fakes for Google
// (DEVELOPMENT.md section 5).
async function routing() {
  const fixture = setUp();
  const { id: tripId } = await fixture.writer.startTrip(OWNER);
  const [grandJunction, torrey] = await fixture.store.places.addPlaces(tripId, [
    placeNamed("Grand Junction"),
    placeNamed("Torrey"),
  ]);
  const sent: { body: unknown; fieldMask: unknown }[] = [];
  const fetchFake: typeof fetch = (url, init) => {
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const headers = new Headers(init?.headers);
    sent.push({ body, fieldMask: headers.get("X-Goog-FieldMask") });
    const text =
      typeof body === "object" && body !== null && "textQuery" in body
        ? String(body.textQuery)
        : "";
    const match = MATCHES[text];
    return Promise.resolve(
      new Response(
        JSON.stringify(match === undefined ? {} : { places: [match] }),
      ),
    );
  };
  const tool = computeRouteTool({
    ...fakeRoutingAccess(fixture, fetchFake),
    tripId,
  });
  return {
    fixture,
    sent,
    grandJunction: present(grandJunction),
    torrey: present(torrey),
    compute: async (input: unknown) =>
      textOf(await tool.handler(tool.inputSchema.parse(input))),
  };
}

describe("compute_route", () => {
  it("routes the points in the order given, with a pass-through point that doesn't split the time, and gives what each plain name matched", async () => {
    const { compute, fixture, sent, grandJunction, torrey } = await routing();
    fixture.routeFinder.driveTimesFor = () => [111, 140];
    const reply = await compute({
      points: [
        { place: grandJunction.id, kind: "stop" },
        { place: "Dewey Bridge, UT", kind: "passThrough" },
        { place: "Moab, UT", kind: "stop" },
        { place: torrey.id, kind: "stop" },
      ],
      order: "keep",
    });
    expect(reply.split("\n")).toEqual([
      "Route, in the order given:",
      "- Grand Junction → Moab, UT, through Dewey Bridge, UT: 1 h 51 m, 25 miles.",
      "- Moab, UT → Torrey: 2 h 20 m, 25 miles.",
      "In all: 4 h 11 m, 50 miles.",
      "Drive times are Google's averages, without the drive buffer. The schedule and the daily driving check add 10% to each drive.",
      "What each plain name matched:",
      '- "Dewey Bridge, UT" matched Salt Lake City, at Salt Lake City, UT, USA.',
      '- "Moab, UT" matched Moab, at Moab, UT 84532, USA.',
    ]);
    const [route] = fixture.routeFinder.routes;
    expect(route?.from.googlePlaceId).toBe(grandJunction.googlePlaceId);
    expect(route?.through.map((point) => point.place.googlePlaceId)).toEqual([
      "google-slc",
      "google-moab",
    ]);
    // Only the fields that make it a Pro call, and nothing saved.
    expect(sent.map((each) => each.fieldMask)).toEqual([
      NAME_MATCH_FIELD_MASK,
      NAME_MATCH_FIELD_MASK,
    ]);
    expect(fixture.store.places.rows).toHaveLength(2);
  });

  it("puts the stops between the first and the last in the fastest order", async () => {
    const { compute, fixture, grandJunction, torrey } = await routing();
    fixture.routeFinder.bestOrderFor = () => ({
      order: [1, 0],
      driveTimes: [60, 90, 30],
    });
    const reply = await compute({
      points: [
        { place: grandJunction.id, kind: "stop" },
        { place: torrey.id, kind: "stop" },
        { place: "Moab, UT", kind: "stop" },
        { place: grandJunction.id, kind: "stop" },
      ],
      order: "fastest",
    });
    expect(reply.split("\n").slice(0, 5)).toEqual([
      "Route, in the fastest order. Google changed the order of the stops between the first and the last.",
      "- Grand Junction → Moab, UT: 1 h, 25 miles.",
      "- Moab, UT → Torrey: 1 h 30 m, 25 miles.",
      "- Torrey → Grand Junction: 30 m, 25 miles.",
      "In all: 3 h, 75 miles.",
    ]);
  });

  it("refuses the fastest order with a pass-through point, and a pass-through point at either end", async () => {
    const { compute, grandJunction, torrey } = await routing();
    expect(
      await compute({
        points: [
          { place: grandJunction.id, kind: "stop" },
          { place: "Dewey Bridge, UT", kind: "passThrough" },
          { place: torrey.id, kind: "stop" },
        ],
        order: "fastest",
      }),
    ).toBe(
      'Google can\'t put stops in the fastest order and steer through pass-through points in one call. Call with "fastest" and no pass-through points, then with "keep" and the pass-through points added.',
    );
    expect(
      await compute({
        points: [
          { place: grandJunction.id, kind: "stop" },
          { place: torrey.id, kind: "passThrough" },
        ],
        order: "keep",
      }),
    ).toBe("The first and the last points are stops, not pass-through points.");
  });

  it("refuses a plain name Google has no match for, an ID of another kind, and another trip's place", async () => {
    const { compute, grandJunction } = await routing();
    const stop = { place: grandJunction.id, kind: "stop" };
    expect(
      await compute({
        points: [stop, { place: "Nowhere, UT", kind: "stop" }],
        order: "keep",
      }),
    ).toBe(
      'Google found no place for "Nowhere, UT". Give it with its state, or look it up with find_place.',
    );
    expect(
      await compute({
        points: [stop, { place: "stay_k7m2x9qa", kind: "stop" }],
        order: "keep",
      }),
    ).toBe("stay_k7m2x9qa is a stay ID, not a place ID.");
    expect(
      await compute({
        points: [stop, { place: "place_k7m2x9qa", kind: "stop" }],
        order: "keep",
      }),
    ).toBe("This trip has no place place_k7m2x9qa.");
  });
});
