import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Place } from "../domain/place.js";
import { TimeOfDay } from "../domain/time-of-day.js";
import {
  FIELD_MASK,
  GooglePlacesError,
  PlacesClient,
  TIMEOUT_MILLISECONDS,
} from "./places-client.js";

const API_KEY = "test-server-key";

// Responses Google gave in phase 15's real lookups. The Smitty's response came before
// places.types was in the field list, so it has no types.
function savedResponse(name: string): string {
  return readFileSync(
    new URL(`saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

interface SentRequest {
  url: string;
  method: string | undefined;
  headers: unknown;
  body: unknown;
  signal: unknown;
}

// A fetch that records each request and answers with the body and status given.
function fakeFetch(
  body: string,
  status = 200,
): { fetch: typeof fetch; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const fetchFake: typeof fetch = (url, init) => {
    const sentBody: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    sent.push({
      url: typeof url === "string" ? url : "not a string",
      method: init?.method,
      headers: init?.headers,
      body: sentBody,
      signal: init?.signal,
    });
    return Promise.resolve(new Response(body, { status }));
  };
  return { fetch: fetchFake, sent };
}

function clientFor(
  body: string,
  status = 200,
): {
  client: PlacesClient;
  sent: SentRequest[];
} {
  const { fetch, sent } = fakeFetch(body, status);
  return { client: new PlacesClient({ apiKey: API_KEY, fetch }), sent };
}

describe("PlacesClient.searchText", () => {
  it("sends the key and the field list in headers, and the query in the body", async () => {
    const { client, sent } = clientFor(savedResponse("smittys-market"));
    await client.searchText("Smitty's Market, Lockhart, TX", 3);
    const [request] = sent;
    expect(request?.url).toBe(
      "https://places.googleapis.com/v1/places:searchText",
    );
    expect(request?.method).toBe("POST");
    expect(request?.headers).toMatchObject({
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    });
    expect(request?.body).toEqual({
      textQuery: "Smitty's Market, Lockhart, TX",
      pageSize: 3,
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(sent[0]?.url).not.toContain(API_KEY);
  });

  it("asks only for the fields a place keeps", () => {
    expect(FIELD_MASK.split(",")).not.toContain("places.photos");
    expect(FIELD_MASK).not.toContain("polyline");
    expect(FIELD_MASK).toContain("places.regularOpeningHours.periods");
  });

  it("keeps the page size within Google's 1 to 20", async () => {
    const { client, sent } = clientFor("{}");
    await client.searchText("barbecue in Lockhart, TX", 50);
    await client.searchText("barbecue in Lockhart, TX", 0);
    expect(sent.map((request) => request.body)).toEqual([
      { textQuery: "barbecue in Lockhart, TX", pageSize: 20 },
      { textQuery: "barbecue in Lockhart, TX", pageSize: 1 },
    ]);
  });

  it("turns a saved response into a place with its facts and opening periods", async () => {
    const { client } = clientFor(savedResponse("smittys-market"));
    const place = onlyPlace(
      await client.searchText("Smitty's Market, Lockhart, TX", 3),
    );
    expect(place.id).toMatch(/^place_/);
    expect(place.googlePlaceId).toBe("ChIJUV8aVvFWQ4YRZfcmdUS-yAI");
    expect(place.name).toBe("Smitty's Market");
    expect(place.type).toBe("Barbecue Restaurant");
    expect(place.address).toBe("208 S Commerce St, Lockhart, TX 78644, USA");
    expect(place.rating).toBe(4.4);
    expect(place.reviewCount).toBe(3697);
    expect(place.priceLevel).toBe("moderate");
    expect(place.openingPeriods).toHaveLength(7);
    const sunday = onlyPeriodOn(place, "sunday");
    expect(sunday.openDay).toBe("sunday");
    expect(sunday.openTime.equals(new TimeOfDay(7, 0))).toBe(true);
    expect(sunday.closeDay).toBe("sunday");
    expect(sunday.closeTime?.equals(new TimeOfDay(18, 0))).toBe(true);
    // Google puts narrow spaces around the times, so \s matches them.
    expect(place.weekdayHoursLines[0]).toMatch(
      /^Monday: 7:00\sAM\s–\s6:00\sPM$/,
    );
    expect(place.summaries).toHaveLength(3);
    expect(place.summaries[2]).toContain("Some reviews mention");
    expect(place.links).toHaveLength(2);
    expect(place.shortLine).toBe(
      "Barbecue Restaurant, 4.4 stars, $$, Lockhart",
    );
  });

  it("gives a street address no name and no type", async () => {
    const { client } = clientFor(savedResponse("street-address"));
    const [place] = await client.searchText("712 Neches St, Lockhart, TX", 3);
    expect(place?.name).toBeNull();
    expect(place?.type).toBeNull();
    expect(place?.openingPeriods).toEqual([]);
    expect(place?.shortLine).toBe("Lockhart");
  });

  it("keeps Google's name for a named building with an address type", async () => {
    const hotel = JSON.stringify({
      places: [
        {
          id: "ChIJhotel",
          displayName: { text: "Madonna Inn" },
          primaryTypeDisplayName: { text: "Hotel" },
          types: ["hotel", "lodging", "premise"],
          formattedAddress: "100 Madonna Rd, San Luis Obispo, CA 93405, USA",
          location: { latitude: 35.27, longitude: -120.67 },
        },
      ],
    });
    const [place] = await clientFor(hotel).client.searchText("Madonna Inn", 1);
    expect(place?.name).toBe("Madonna Inn");
  });

  it("returns no places when nothing matches", async () => {
    const { client } = clientFor("{}");
    expect(await client.searchText("nowhere at all", 3)).toEqual([]);
  });

  it("reads hours past midnight, and a place that's always open", async () => {
    const overnight = googleResponse({
      periods: [
        {
          open: { day: 1, hour: 17, minute: 0 },
          close: { day: 2, hour: 2, minute: 0 },
        },
      ],
    });
    const { client } = clientFor(overnight);
    const [bar] = await client.searchText("bar", 1);
    expect(bar?.openingPeriods[0]?.closeDay).toBe("tuesday");
    const alwaysOpen = googleResponse({
      periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
    });
    const [store] = await clientFor(alwaysOpen).client.searchText("store", 1);
    expect(store?.openingPeriods[0]?.closeDay).toBeNull();
    expect(store?.openingPeriods[0]?.closeTime).toBeNull();
  });

  it("refuses a response it doesn't understand", async () => {
    const noAddress = JSON.stringify({
      places: [{ id: "abc", location: { latitude: 1, longitude: 2 } }],
    });
    await expect(
      clientFor(noAddress).client.searchText("x", 1),
    ).rejects.toThrow(GooglePlacesError);
    const newPriceLevel = googleResponse({}, "PRICE_LEVEL_LAVISH");
    await expect(
      clientFor(newPriceLevel).client.searchText("x", 1),
    ).rejects.toThrow(GooglePlacesError);
  });

  it("passes on Google's error status and message", async () => {
    const error = JSON.stringify({
      error: {
        code: 403,
        message: "Requests to this API are blocked.",
        status: "PERMISSION_DENIED",
      },
    });
    await expect(
      clientFor(error, 403).client.searchText("x", 1),
    ).rejects.toThrow(
      "Google Places refused the search with status 403, PERMISSION_DENIED: Requests to this API are blocked.",
    );
  });

  it("gives up when Google doesn't answer in time", async () => {
    const timesOut: typeof fetch = () =>
      Promise.reject(new DOMException("timed out", "TimeoutError"));
    const client = new PlacesClient({ apiKey: API_KEY, fetch: timesOut });
    await expect(client.searchText("x", 1)).rejects.toThrow(
      `didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds`,
    );
  });

  it("gives up when the time runs out while the reply is still being read", async () => {
    const stallsInBody: typeof fetch = () =>
      Promise.resolve(new Response(bodyThatTimesOut()));
    const client = new PlacesClient({ apiKey: API_KEY, fetch: stallsInBody });
    await expect(client.searchText("x", 1)).rejects.toThrow(
      `Google Places didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds. Try again.`,
    );
  });

  it("refuses a reply that isn't JSON as one it doesn't understand", async () => {
    await expect(
      clientFor("<html>Oops</html>").client.searchText("x", 1),
    ).rejects.toThrow(
      "Google Places sent a response the app doesn't understand",
    );
  });
});

// A body whose stream fails the way fetch's timeout makes it fail.
function bodyThatTimesOut(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(new DOMException("timed out", "TimeoutError"));
    },
  });
}

function onlyPlace(places: readonly Place[]): Place {
  const [place] = places;
  if (place === undefined || places.length !== 1) {
    throw new Error(`Expected one place, got ${String(places.length)}.`);
  }
  return place;
}

function onlyPeriodOn(
  place: Place,
  day: string,
): Place["openingPeriods"][number] {
  const period = place.openingPeriods.find((each) => each.openDay === day);
  if (period === undefined) {
    throw new Error(`No period opens on ${day}.`);
  }
  return period;
}

// A one-place response with the hours and price level given.
function googleResponse(hours: object, priceLevel?: string): string {
  return JSON.stringify({
    places: [
      {
        id: "ChIJtest",
        displayName: { text: "Test place" },
        formattedAddress: "1 Main St, Moab, UT 84532, USA",
        location: { latitude: 38.57, longitude: -109.55 },
        regularOpeningHours: hours,
        ...(priceLevel === undefined ? {} : { priceLevel }),
      },
    ],
  });
}
