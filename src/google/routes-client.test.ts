import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Place } from "../domain/place.js";
import { examplePlace } from "../domain/place.fake.js";
import { bodyThatBreaks, bodyThatTimesOut } from "./failing-body.fake.js";
import {
  BEST_ORDER_FIELD_MASK,
  FIELD_MASK,
  GoogleRoutesError,
  NoDrivingRouteError,
  RoutesClient,
} from "./routes-client.js";

const API_KEY = "test-server-key";

// Responses Google gave in phase 19's real run, for San Francisco Day 2. One routes
// Monterey → First Awakenings → San Luis Obispo through Big Sur. The other asks for the
// best order of Nepenthe and First Awakenings.
function savedResponse(name: string): string {
  return readFileSync(
    new URL(`saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

function place(name: string, googlePlaceId: string): Place {
  return examplePlace({ name, googlePlaceId });
}

const MONTEREY = place("Monterey", "ChIJkfu1cFLkjYARXj1K2AlJSO4");
const SAN_LUIS_OBISPO = place("San Luis Obispo", "ChIJJ8Jse77m7IARRg_vzsKQArw");
const FIRST_AWAKENINGS = place(
  "First Awakenings",
  "ChIJrfWO1armjYAROvxaOhHwevQ",
);
const BIG_SUR = place("Big Sur", "ChIJVVikTfuPjYARYuO38cfXpRY");
const NEPENTHE = place("Nepenthe", "ChIJQ_ztClqEjYARRELZA9B9wbs");

interface SentRequest {
  url: string;
  headers: unknown;
  body: unknown;
  signal: unknown;
}

function clientFor(
  body: string,
  status = 200,
): { client: RoutesClient; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const fetchFake: typeof fetch = (url, init) => {
    sent.push({
      url: typeof url === "string" ? url : "not a string",
      headers: init?.headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      signal: init?.signal,
    });
    return Promise.resolve(new Response(body, { status }));
  };
  return {
    client: new RoutesClient({ apiKey: API_KEY, fetch: fetchFake }),
    sent,
  };
}

const THROUGH_BIG_SUR = {
  from: MONTEREY,
  through: [
    { place: FIRST_AWAKENINGS, isPassThrough: false },
    { place: BIG_SUR, isPassThrough: true },
  ],
  to: SAN_LUIS_OBISPO,
};

describe("RoutesClient.route", () => {
  it("sends the key and field list in headers, and the places by Google place ID, with the waypoint as a via point", async () => {
    const { client, sent } = clientFor(savedResponse("route-through-big-sur"));
    await client.route(THROUGH_BIG_SUR);
    const [request] = sent;
    expect(request?.url).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    expect(request?.url).not.toContain(API_KEY);
    expect(request?.headers).toMatchObject({
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    });
    expect(request?.body).toEqual({
      origin: { placeId: "ChIJkfu1cFLkjYARXj1K2AlJSO4" },
      destination: { placeId: "ChIJJ8Jse77m7IARRg_vzsKQArw" },
      intermediates: [
        { placeId: "ChIJrfWO1armjYAROvxaOhHwevQ", via: false },
        { placeId: "ChIJVVikTfuPjYARYuO38cfXpRY", via: true },
      ],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives each segment's drive time in minutes, the distance in miles, and the route line. The waypoint doesn't split a segment", async () => {
    const { client } = clientFor(savedResponse("route-through-big-sur"));
    const route = await client.route(THROUGH_BIG_SUR);
    // 396 and 11,654 seconds, and 223,677 meters.
    expect(route.segmentDriveTimesInMinutes).toEqual([7, 194]);
    expect(route.distanceInMiles).toBe(139);
    expect(route.routeLine.length).toBeGreaterThan(1000);
  });

  it("turns an empty answer into a no driving route error that names the places", async () => {
    const { client } = clientFor("{}");
    const route = client.route({
      from: MONTEREY,
      through: [{ place: FIRST_AWAKENINGS, isPassThrough: false }],
      to: place("Honolulu", "ChIJTUbDjDsYAHwRbJen81_1KEs"),
    });
    await expect(route).rejects.toThrow(NoDrivingRouteError);
    await expect(route).rejects.toThrow(
      "Google found no driving route from Monterey through First Awakenings to Honolulu.",
    );
  });

  it("refuses an error status, with Google's reason", async () => {
    const { client } = clientFor(
      JSON.stringify({
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "The API key is invalid.",
        },
      }),
      403,
    );
    await expect(client.route(THROUGH_BIG_SUR)).rejects.toThrow(
      "Google Routes refused the route with status 403, PERMISSION_DENIED: The API key is invalid.",
    );
  });

  it("refuses a response it doesn't understand, or one with the wrong number of segments", async () => {
    const odd = clientFor(JSON.stringify({ routes: [{ legs: "many" }] }));
    await expect(odd.client.route(THROUGH_BIG_SUR)).rejects.toThrow(
      GoogleRoutesError,
    );
    const short = clientFor(savedResponse("route-through-big-sur"));
    await expect(
      short.client.route({ ...THROUGH_BIG_SUR, through: [] }),
    ).rejects.toThrow("Google Routes gave 2 segments for a route with 1.");
  });

  // Google's answer on 2026-10-16 for Monterey to Monterey, with no stops: one leg of
  // "0s", no distance, and a route line of one point (open item 19).
  it("routes a day that starts and ends at the same place as 0 minutes and 0 miles", async () => {
    const { client } = clientFor(savedResponse("route-same-place"));
    const route = await client.route({
      from: MONTEREY,
      through: [],
      to: MONTEREY,
    });
    expect(route).toEqual({
      segmentDriveTimesInMinutes: [0],
      distanceInMiles: 0,
      routeLine: "c|j~Efe_gV",
    });
  });

  it("counts a segment Google leaves no duration on as 0 minutes", async () => {
    const { client } = clientFor(
      JSON.stringify({
        routes: [
          {
            legs: [{}, { duration: "90s" }],
            polyline: { encodedPolyline: "abc" },
          },
        ],
      }),
    );
    const route = await client.route({
      from: MONTEREY,
      through: [{ place: MONTEREY, isPassThrough: false }],
      to: SAN_LUIS_OBISPO,
    });
    expect(route).toEqual({
      segmentDriveTimesInMinutes: [0, 2],
      distanceInMiles: 0,
      routeLine: "abc",
    });
  });

  it("refuses a call that fails or takes too long", async () => {
    const failing = new RoutesClient({
      apiKey: API_KEY,
      fetch: () =>
        Promise.reject(new DOMException("timed out", "TimeoutError")),
    });
    await expect(failing.route(THROUGH_BIG_SUR)).rejects.toThrow(
      "Google Routes didn't answer within 10 seconds. Try again.",
    );
  });

  it("refuses a call whose time runs out while the reply is still being read", async () => {
    const stallsInBody = new RoutesClient({
      apiKey: API_KEY,
      fetch: () => Promise.resolve(new Response(bodyThatTimesOut())),
    });
    await expect(stallsInBody.route(THROUGH_BIG_SUR)).rejects.toThrow(
      "Google Routes didn't answer within 10 seconds. Try again.",
    );
  });

  it("keeps the error status when the error's body breaks off", async () => {
    const breaks = new RoutesClient({
      apiKey: API_KEY,
      fetch: () =>
        Promise.resolve(new Response(bodyThatBreaks(), { status: 500 })),
    });
    await expect(breaks.route(THROUGH_BIG_SUR)).rejects.toThrow(
      "Google Routes refused the route with status 500.",
    );
  });
});

describe("RoutesClient.bestOrder", () => {
  it("asks for the best order, with no via points, and gives the order and its route", async () => {
    const { client, sent } = clientFor(savedResponse("route-best-order"));
    const best = await client.bestOrder({
      from: MONTEREY,
      stops: [NEPENTHE, FIRST_AWAKENINGS],
      to: SAN_LUIS_OBISPO,
    });
    expect(sent[0]?.headers).toMatchObject({
      "X-Goog-FieldMask": BEST_ORDER_FIELD_MASK,
    });
    expect(sent[0]?.body).toMatchObject({
      optimizeWaypointOrder: true,
      intermediates: [
        { placeId: "ChIJQ_ztClqEjYARRELZA9B9wbs", via: false },
        { placeId: "ChIJrfWO1armjYAROvxaOhHwevQ", via: false },
      ],
    });
    expect(best.order).toEqual([1, 0]);
    expect(best.route.segmentDriveTimesInMinutes).toEqual([7, 59, 136]);
  });

  it("refuses an order that doesn't hold each stop once", async () => {
    const { client } = clientFor(
      JSON.stringify({
        routes: [
          {
            legs: [{}, {}, {}],
            polyline: { encodedPolyline: "abc" },
            optimizedIntermediateWaypointIndex: [0, 0],
          },
        ],
      }),
    );
    await expect(
      client.bestOrder({
        from: MONTEREY,
        stops: [NEPENTHE, FIRST_AWAKENINGS],
        to: SAN_LUIS_OBISPO,
      }),
    ).rejects.toThrow("doesn't hold each stop once");
  });
});
