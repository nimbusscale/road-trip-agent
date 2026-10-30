import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import type { setUp } from "../persistence/trip-writer.fake.js";
import {
  moved,
  planned,
  savedResponse,
  searchFor,
} from "./search-near-tool.fake.js";
import { textOf } from "./stored-trip.fake.js";

// search_near drops places past the near cutoff distance (tool design 2.3).

// St. Augustine, Florida, about 2,100 miles from San Luis Obispo.
const ST_AUGUSTINE = { latitude: 29.8947, longitude: -81.3145 };

// The names of the places the search saved to the trip, after the rows it started with.
function savedNames(
  fixture: ReturnType<typeof setUp>,
  before: number,
): string[] {
  return fixture.store.places.rows
    .slice(before)
    .map((row) => row.place.name ?? "")
    .sort();
}

describe("search_near's cutoff distance", () => {
  it("drops places more than the cutoff distance away, without saving them, and says how many", async () => {
    const planning = planned();
    const { search, fixture } = await searchFor(
      planning.trip,
      // Apple Farm Inn is the second place.
      moved(savedResponse("near-slo-hotels"), ST_AUGUSTINE, [1]),
    );
    const before = fixture.store.places.rows.length;
    const reply = await search({
      stopOrStayId: present(planning.itinerary.stays[1]).id,
      query: "hotels",
    });
    const text = textOf(reply);
    expect(text).toContain("La Quinta Inn & Suites");
    expect(text).toContain("Hotel San Luis Obispo");
    expect(text).not.toContain("Apple Farm Inn");
    expect(text.split("\n").slice(-2)).toEqual([
      "",
      "Left out: 1 place more than 100 miles away.",
    ]);
    expect(savedNames(fixture, before)).toEqual([
      "Hotel San Luis Obispo",
      "La Quinta Inn & Suites by Wyndham San Luis Obispo Downtown",
    ]);
  });

  it("says it found nothing near when every place is past the cutoff distance", async () => {
    const planning = planned();
    const stay = present(planning.itinerary.stays[1]);
    const { search, fixture } = await searchFor(
      planning.trip,
      moved(savedResponse("near-slo-hotels"), ST_AUGUSTINE),
    );
    const before = fixture.store.places.rows.length;
    const reply = await search({ stopOrStayId: stay.id, query: "hotels" });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply)).toBe(
      [
        `Google found no places for "hotels" around San Luis Obispo (${stay.place.id}).`,
        "",
        "Left out: 3 places more than 100 miles away.",
      ].join("\n"),
    );
    expect(savedNames(fixture, before)).toEqual([]);
  });
});
