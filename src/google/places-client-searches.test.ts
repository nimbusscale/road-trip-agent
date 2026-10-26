import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ALONG_ROUTE_FIELD_MASK,
  FIELD_MASK,
  PlacesClient,
} from "./places-client.js";

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

const ROUTE = {
  routeLine: "_p~iF~ps|U_ulLnnqC",
  start: { latitude: 36.5973, longitude: -121.8978 },
};

describe("PlacesClient.searchAlongRoute", () => {
  it("sends the route line and its start, and asks for each place's routing summary", async () => {
    const { client, sent } = clientFor(
      savedResponse("along-big-sur-state-parks"),
    );
    await client.searchAlongRoute("state park", ROUTE, 30);
    expect(ALONG_ROUTE_FIELD_MASK).toBe(`${FIELD_MASK},routingSummaries`);
    expect(sent[0]?.headers).toMatchObject({
      "X-Goog-FieldMask": ALONG_ROUTE_FIELD_MASK,
    });
    expect(sent[0]?.body).toEqual({
      textQuery: "state park",
      pageSize: 20,
      searchAlongRouteParameters: {
        polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
      },
      routingParameters: {
        origin: { latitude: 36.5973, longitude: -121.8978 },
      },
    });
  });

  it("pairs each place with its drives from the route's start and on to its end, in minutes and miles", async () => {
    const { client } = clientFor(savedResponse("along-big-sur-state-parks"));
    const [molera] = await client.searchAlongRoute("state park", ROUTE, 20);
    expect(molera?.place.name).toBe("Andrew Molera State Park");
    // 41,750 meters in 2,602 seconds, then 175,607 meters in 8,813 seconds.
    expect(molera?.route?.fromStart.driveTimeInMinutes).toBe(43);
    expect(molera?.route?.fromStart.distanceInMiles).toBeCloseTo(25.94, 2);
    expect(molera?.route?.toEnd.driveTimeInMinutes).toBe(147);
    expect(molera?.route?.toEnd.distanceInMiles).toBeCloseTo(109.12, 2);
  });

  it("gives a place Google has no routing summary for no route, and a missing value 0", async () => {
    const { client } = clientFor(
      JSON.stringify({
        places: [googlePlace("first"), googlePlace("second")],
        routingSummaries: [{}, { legs: [{ duration: "0s" }, {}] }],
      }),
    );
    const [first, second] = await client.searchAlongRoute("park", ROUTE, 20);
    expect(first?.route).toBeNull();
    expect(second?.route).toEqual({
      fromStart: { driveTimeInMinutes: 0, distanceInMiles: 0 },
      toEnd: { driveTimeInMinutes: 0, distanceInMiles: 0 },
    });
  });

  it("returns no places when nothing matches", async () => {
    const { client } = clientFor("{}");
    expect(await client.searchAlongRoute("park", ROUTE, 20)).toEqual([]);
  });
});

function googlePlace(id: string): object {
  return {
    id,
    displayName: { text: id },
    formattedAddress: "Big Sur, CA 93920, USA",
    location: { latitude: 36.27, longitude: -121.81 },
  };
}
