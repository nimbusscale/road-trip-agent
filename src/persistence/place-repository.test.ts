import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { exampleAddress, examplePlace } from "../domain/place.fake.js";
import { PLACE_COLUMNS, PlaceRepository } from "./place-repository.js";
import type { Queryable } from "./queryable.js";

const TRIP_ID = "trip_k7m2x9qa";

// Records each query, and answers every SELECT with the rows given. The SQL itself is
// checked by hand against the local Postgres (DEVELOPMENT.md section 5).
class FakeConnection implements Queryable {
  readonly calls: { text: string; values: readonly unknown[] }[] = [];

  constructor(private readonly rows: readonly unknown[] = []) {}

  query(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: readonly unknown[] }> {
    this.calls.push({ text, values });
    return Promise.resolve({
      rows: text.startsWith("SELECT") ? this.rows : [],
    });
  }
}

// The row Postgres would give back for what an INSERT sent: jsonb comes back as an
// object, and the rest as sent. Built from the column list, since only *.schema.ts
// files spell out the snake_case names.
async function storedRowsOf(
  places: Parameters<PlaceRepository["addPlaces"]>[1],
): Promise<unknown[]> {
  const connection = new FakeConnection();
  await new PlaceRepository(connection)
    .addPlaces(TRIP_ID, places)
    .catch(() => []);
  const values = connection.calls[0]?.values ?? [];
  const width = PLACE_COLUMNS.length;
  return [...places.keys()].map((index) => {
    const own = values.slice(index * width, (index + 1) * width);
    return Object.fromEntries(
      PLACE_COLUMNS.map((column, at) => [
        column,
        column === "opening_periods" ? JSON.parse(String(own[at])) : own[at],
      ]),
    );
  });
}

describe("PlaceRepository", () => {
  it("adds places with each value as a parameter, keeping a place the trip has", async () => {
    const connection = new FakeConnection();
    const place = examplePlace();
    await new PlaceRepository(connection)
      .addPlaces(TRIP_ID, [place])
      .catch(() => []);
    const [insert] = connection.calls;
    expect(insert?.text).toContain(
      "ON CONFLICT (trip_id, google_place_id) DO NOTHING",
    );
    expect(insert?.values).toContain("Smitty's Market");
    expect(insert?.values).toContain(TRIP_ID);
    expect(insert?.text).not.toContain("Smitty");
  });

  it("reads back a stored place as it was saved", async () => {
    const place = examplePlace();
    const rows = await storedRowsOf([place]);
    const repository = new PlaceRepository(new FakeConnection(rows));
    const loaded = await repository.get(TRIP_ID, place.id);
    expect(loaded).toEqual(place);
    expect(loaded?.openingPeriods[0]?.closeTime?.toText()).toBe("18:00");
  });

  it("returns the stored places in the order given, with the stored IDs", async () => {
    const smittys = examplePlace();
    const address = exampleAddress();
    const rows = await storedRowsOf([address, smittys]);
    const repository = new PlaceRepository(new FakeConnection(rows));
    const again = [examplePlace(), exampleAddress()];
    const stored = await repository.addPlaces(TRIP_ID, again);
    expect(stored.map((place) => place.id)).toEqual([smittys.id, address.id]);
  });

  it("names the trip in every query", async () => {
    const connection = new FakeConnection();
    const repository = new PlaceRepository(connection);
    await repository.loadForTrip(TRIP_ID);
    await repository.get(TRIP_ID, "place_k7m2x9qa");
    expect(connection.calls.map((call) => call.values)).toEqual([
      [TRIP_ID],
      ["place_k7m2x9qa", TRIP_ID],
    ]);
    expect(connection.calls[1]?.text).toMatch(
      /WHERE id = \$1 AND trip_id = \$2$/,
    );
  });

  it("returns undefined when the trip has no such place", async () => {
    const repository = new PlaceRepository(new FakeConnection());
    expect(await repository.get(TRIP_ID, "place_k7m2x9qa")).toBeUndefined();
  });

  it("sends nothing to add or fill no places", async () => {
    const connection = new FakeConnection();
    const repository = new PlaceRepository(connection);
    expect(await repository.addPlaces(TRIP_ID, [])).toEqual([]);
    await repository.fillNames([]);
    expect(connection.calls).toEqual([]);
  });

  it("fills a name only where the row has none", async () => {
    const connection = new FakeConnection();
    const address = exampleAddress();
    address.fillName("Mike's house");
    await new PlaceRepository(connection).fillNames([address]);
    expect(connection.calls).toEqual([
      {
        text: "UPDATE places SET name = $2 WHERE id = $1 AND name IS NULL",
        values: [address.id, "Mike's house"],
      },
    ]);
  });

  it("refuses a row that doesn't match the schema", async () => {
    const badRow = { id: "place_k7m2x9qa", name: "Smitty's Market" };
    const repository = new PlaceRepository(new FakeConnection([badRow]));
    await expect(repository.loadForTrip(TRIP_ID)).rejects.toThrow(ZodError);
  });
});
