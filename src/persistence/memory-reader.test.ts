import { describe, expect, it } from "vitest";

import { FAKE_POOL, FakeMemoryStore } from "./fake-memory-store.js";
import { MemoryReader } from "./memory-reader.js";

const USER_A = "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f";
const USER_B = "7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a";
const TRIP_1 = "trip_aaaaaaaa";
const TRIP_2 = "trip_bbbbbbbb";

function storeWithRows(): FakeMemoryStore {
  const store = new FakeMemoryStore();
  const rows: [string, string, string | null, string][] = [
    ["mem_a3", USER_A, TRIP_1, "2026-10-15T12:03:00Z"],
    ["mem_a1", USER_A, null, "2026-10-15T12:01:00Z"],
    ["mem_a2", USER_A, TRIP_2, "2026-10-15T12:02:00Z"],
    ["mem_b1", USER_B, null, "2026-10-15T12:00:00Z"],
    ["mem_b2", USER_B, TRIP_1, "2026-10-15T12:04:00Z"],
  ];
  for (const [id, userId, tripId, created] of rows) {
    store.rows.push({
      id,
      userId,
      tripId,
      text: `note ${id}`,
      createdDateTime: new Date(created),
    });
  }
  return store;
}

function readerFor(store: FakeMemoryStore): MemoryReader {
  return new MemoryReader({ pool: FAKE_POOL, makeStore: () => store });
}

describe("MemoryReader.read", () => {
  it("returns the user's memory and this trip's memory, in the order created", async () => {
    const items = await readerFor(storeWithRows()).read(USER_A, TRIP_1);
    expect(items.map((item) => item.id)).toEqual(["mem_a1", "mem_a3"]);
  });

  it("doesn't return another user's items, even on the same trip", async () => {
    const items = await readerFor(storeWithRows()).read(USER_B, TRIP_1);
    expect(items.map((item) => item.id)).toEqual(["mem_b1", "mem_b2"]);
    expect(items.every((item) => item.userId === USER_B)).toBe(true);
  });

  it("returns nothing for a user with no memory", async () => {
    const otherUser = "9a8b7c6d-5e4f-4a3b-8c1d-0e9f8a7b6c5d";
    expect(await readerFor(storeWithRows()).read(otherUser, TRIP_1)).toEqual(
      [],
    );
  });
});
