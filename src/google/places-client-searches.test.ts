import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FIELD_MASK, PlacesClient } from "./places-client.js";

// The searches near a point and along a route (Google design 2.1), over responses
// Google gave on 2026-10-26: hotels and tri-tip near San Luis Obispo, and state parks
// along the saved Big Sur route, each cut down to a few places.

const API_KEY = "test-server-key";

function savedResponse(name: string): string {
  return readFileSync(
    new URL(`saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

interface Sent {
  headers: unknown;
  body: unknown;
}

function clientFor(body: string): { client: PlacesClient; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetchFake: typeof fetch = (url, init) => {
    sent.push({
      headers: init?.headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return Promise.resolve(new Response(body));
  };
  return {
    client: new PlacesClient({ apiKey: API_KEY, fetch: fetchFake }),
    sent,
  };
}

describe("PlacesClient.searchNear", () => {
  it("biases the search to a circle around the point, with every field a place keeps", async () => {
    const { client, sent } = clientFor(savedResponse("near-slo-hotels"));
    const places = await client.searchNear(
      "hotels",
      { latitude: 35.2828, longitude: -120.6596, radiusInMeters: 24_140 },
      10,
    );
    expect(sent[0]?.headers).toMatchObject({ "X-Goog-FieldMask": FIELD_MASK });
    expect(sent[0]?.body).toEqual({
      textQuery: "hotels",
      pageSize: 10,
      locationBias: {
        circle: {
          center: { latitude: 35.2828, longitude: -120.6596 },
          radius: 24_140,
        },
      },
    });
    expect(places.map((place) => place.name)).toEqual([
      "La Quinta Inn & Suites by Wyndham San Luis Obispo Downtown",
      "Apple Farm Inn",
      "Hotel San Luis Obispo",
    ]);
    expect(places[1]?.weekdayHoursLines[0]).toBe("Monday: 7:00 AM – 9:00 PM");
  });
});

const ROUTE_LINE = "_p~iF~ps|U_ulLnnqC";

describe("PlacesClient.searchAlongRoute", () => {
  it("sends the route line, with every field a place keeps and no routing summaries", async () => {
    const { client, sent } = clientFor(
      savedResponse("along-big-sur-state-parks"),
    );
    const places = await client.searchAlongRoute("state park", ROUTE_LINE, 30);
    expect(sent[0]?.headers).toMatchObject({ "X-Goog-FieldMask": FIELD_MASK });
    expect(sent[0]?.body).toEqual({
      textQuery: "state park",
      pageSize: 20,
      searchAlongRouteParameters: {
        polyline: { encodedPolyline: ROUTE_LINE },
      },
    });
    expect(places[0]?.name).toBe("Andrew Molera State Park");
    expect(places).toHaveLength(6);
  });

  it("returns no places when nothing matches", async () => {
    const { client } = clientFor("{}");
    expect(await client.searchAlongRoute("park", ROUTE_LINE, 20)).toEqual([]);
  });
});
