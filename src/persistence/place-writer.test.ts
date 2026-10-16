import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { exampleAddress, examplePlace } from "../domain/place.fake.js";
import { PlacesClient } from "../google/places-client.js";
import { FAKE_POOL } from "./fake-memory-store.js";
import { NoSuchPlaceError } from "./place-errors.js";
import { PlaceReader } from "./place-reader.js";
import { FakePlaceStore } from "./place-store.fake.js";
import { PlaceWriter } from "./place-writer.js";

const TRIP_ID = "trip_k7m2x9qa";
const OTHER_TRIP_ID = "trip_m3n4p5q6";

function setUp(): {
  writer: PlaceWriter;
  reader: PlaceReader;
  store: FakePlaceStore;
} {
  const store = new FakePlaceStore();
  const makeStore = (): FakePlaceStore => store;
  return {
    writer: new PlaceWriter({ pool: FAKE_POOL, makeStore }),
    reader: new PlaceReader({ pool: FAKE_POOL, makeStore }),
    store,
  };
}

// Answers every search with the response Google gave for Smitty's Market.
function smittysClient(): PlacesClient {
  const body = readFileSync(
    new URL("../google/saved-responses/smittys-market.json", import.meta.url),
    "utf8",
  );
  return new PlacesClient({
    apiKey: "test-server-key",
    fetch: () => Promise.resolve(new Response(body)),
  });
}

describe("PlaceWriter.save", () => {
  it("stores a place found twice once, and gives back the first record", async () => {
    const { writer, store } = setUp();
    const client = smittysClient();
    const query = "Smitty's Market, Lockhart, TX";
    const [first] = await writer.save(
      TRIP_ID,
      await client.searchText(query, 3),
    );
    const [second] = await writer.save(
      TRIP_ID,
      await client.searchText(query, 3),
    );
    expect(store.rows).toHaveLength(1);
    expect(second?.id).toBe(first?.id);
  });

  it("keeps a place per trip", async () => {
    const { writer, store } = setUp();
    await writer.save(TRIP_ID, [examplePlace()]);
    await writer.save(OTHER_TRIP_ID, [examplePlace()]);
    expect(store.rows).toHaveLength(2);
  });

  it("returns the stored places in the order given", async () => {
    const { writer } = setUp();
    const [address] = await writer.save(TRIP_ID, [exampleAddress()]);
    const stored = await writer.save(TRIP_ID, [
      examplePlace(),
      exampleAddress(),
    ]);
    expect(stored[1]?.id).toBe(address?.id);
    expect(stored.map((place) => place.name)).toEqual([
      "Smitty's Market",
      null,
    ]);
  });
});

describe("PlaceReader.get", () => {
  it("reads one of the trip's places", async () => {
    const { writer, reader } = setUp();
    const [place] = await writer.save(TRIP_ID, [examplePlace()]);
    const read = await reader.get(TRIP_ID, place?.id ?? "");
    expect(read.name).toBe("Smitty's Market");
  });

  it("refuses another trip's place the same way as one that doesn't exist", async () => {
    const { writer, reader } = setUp();
    const [place] = await writer.save(OTHER_TRIP_ID, [examplePlace()]);
    const placeId = place?.id ?? "";
    await expect(reader.get(TRIP_ID, placeId)).rejects.toThrow(
      new NoSuchPlaceError(placeId),
    );
    await expect(reader.get(TRIP_ID, "place_zzzzzzzz")).rejects.toThrow(
      NoSuchPlaceError,
    );
  });
});
