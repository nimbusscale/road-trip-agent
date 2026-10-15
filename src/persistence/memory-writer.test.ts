import { describe, expect, it } from "vitest";

import { RuleError } from "../domain/rule-error.js";
import { FAKE_POOL, FakeMemoryStore } from "./fake-memory-store.js";
import type { MemoryItemProperties } from "./memory-item.js";
import { MemoryWriter, NO_SUCH_MEMORY_ITEM } from "./memory-writer.js";

const USER_A = "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f";
const USER_B = "7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a";
const TRIP_1 = "trip_aaaaaaaa";
const TRIP_2 = "trip_bbbbbbbb";
const STARTED_TRIP = "trip_ssssssss";
const MISSING_ID = "mem_zzzzzzzz";
const STARTED =
  "This trip has started, so its memory can't change. User memory still can.";

const LIMITS = { maximumMemoryItems: 3, maximumMemoryItemCharacters: 20 };

interface Setup {
  store: FakeMemoryStore;
  writer: MemoryWriter;
}

function setUp(): Setup {
  const store = new FakeMemoryStore();
  const writer = new MemoryWriter({
    pool: FAKE_POOL,
    makeStore: () => store,
    hasTripStarted: (connection, tripId) =>
      Promise.resolve(tripId === STARTED_TRIP),
    limits: LIMITS,
  });
  return { store, writer };
}

function addRow(
  store: FakeMemoryStore,
  id: string,
  userId: string,
  tripId: string | null,
): void {
  const row: MemoryItemProperties = {
    id,
    userId,
    tripId,
    text: `note ${id}`,
    createdDateTime: new Date("2026-10-15T12:00:00Z"),
  };
  store.rows.push(row);
}

function textsOf(store: FakeMemoryStore): string[] {
  return store.rows.map((row) => row.text);
}

describe("MemoryWriter.add", () => {
  it("adds a user item, with a new ID and no trip", async () => {
    const { store, writer } = setUp();
    const item = await writer.add(USER_A, null, "we skip chains");
    expect(item.id).toMatch(/^mem_.{8}$/);
    expect(item.tripId).toBeNull();
    expect(store.rows).toEqual([
      expect.objectContaining({ id: item.id, userId: USER_A, tripId: null }),
    ]);
  });

  it("adds a trip item to the session's trip", async () => {
    const { store, writer } = setUp();
    const item = await writer.add(USER_A, TRIP_1, "skip I-35 this time");
    expect(item.tripId).toBe(TRIP_1);
    expect(textsOf(store)).toEqual(["skip I-35 this time"]);
  });

  it("refuses text over the maximum length, and gives the limit", async () => {
    const { store, writer } = setUp();
    await expect(writer.add(USER_A, null, "x".repeat(21))).rejects.toThrow(
      new RuleError("A memory item is at most 20 characters. This one is 21."),
    );
    expect(store.rows).toEqual([]);
  });

  it("takes text at the maximum length", async () => {
    const { writer } = setUp();
    const item = await writer.add(USER_A, null, "x".repeat(20));
    expect(item.text).toHaveLength(20);
  });

  it("refuses empty text", async () => {
    const { writer } = setUp();
    await expect(writer.add(USER_A, null, "  ")).rejects.toThrow(
      "A memory item's text can't be empty.",
    );
  });

  it("refuses an add to full user memory, and gives the limit", async () => {
    const { store, writer } = setUp();
    ["mem_a1", "mem_a2", "mem_a3"].forEach((id) => {
      addRow(store, id, USER_A, null);
    });
    await expect(writer.add(USER_A, null, "one more")).rejects.toThrow(
      new RuleError(
        "User memory already holds 3 items, the most it can. Merge or forget items first.",
      ),
    );
    expect(store.rows).toHaveLength(3);
  });

  it("refuses an add to a full trip memory, and gives the limit", async () => {
    const { store, writer } = setUp();
    ["mem_t1", "mem_t2", "mem_t3"].forEach((id) => {
      addRow(store, id, USER_A, TRIP_1);
    });
    await expect(writer.add(USER_A, TRIP_1, "one more")).rejects.toThrow(
      new RuleError(
        "This trip's memory already holds 3 items, the most it can. Merge or forget items first.",
      ),
    );
  });

  it("counts user memory, each trip's memory, and each user apart", async () => {
    const { store, writer } = setUp();
    ["mem_t1", "mem_t2", "mem_t3"].forEach((id) => {
      addRow(store, id, USER_A, TRIP_1);
    });
    ["mem_b1", "mem_b2", "mem_b3"].forEach((id) => {
      addRow(store, id, USER_B, null);
    });
    await writer.add(USER_A, null, "user note");
    await writer.add(USER_A, TRIP_2, "other trip note");
    expect(store.rows).toHaveLength(8);
  });
});

describe("MemoryWriter.update", () => {
  it("replaces an item's text", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, TRIP_1);
    const item = await writer.update(USER_A, TRIP_1, "mem_a1", "new text");
    expect(item.text).toBe("new text");
    expect(textsOf(store)).toEqual(["new text"]);
  });

  it("updates a user item from any trip's session", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, null);
    await writer.update(USER_A, TRIP_2, "mem_a1", "new text");
    expect(textsOf(store)).toEqual(["new text"]);
  });

  it("refuses text over the maximum length, and saves nothing", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, null);
    await expect(
      writer.update(USER_A, TRIP_1, "mem_a1", "x".repeat(25)),
    ).rejects.toThrow(
      "A memory item is at most 20 characters. This one is 25.",
    );
    expect(textsOf(store)).toEqual(["note mem_a1"]);
  });

  it("refuses an ID that doesn't exist", async () => {
    const { writer } = setUp();
    await expect(
      writer.update(USER_A, TRIP_1, MISSING_ID, "new text"),
    ).rejects.toThrow(new RuleError(NO_SUCH_MEMORY_ITEM));
  });

  it("refuses another user's item, with the same error", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_b1", USER_B, null);
    await expect(
      writer.update(USER_A, TRIP_1, "mem_b1", "new text"),
    ).rejects.toThrow(new RuleError(NO_SUCH_MEMORY_ITEM));
    expect(textsOf(store)).toEqual(["note mem_b1"]);
  });

  it("refuses another trip's item, with the same error", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, TRIP_2);
    await expect(
      writer.update(USER_A, TRIP_1, "mem_a1", "new text"),
    ).rejects.toThrow(new RuleError(NO_SUCH_MEMORY_ITEM));
    expect(textsOf(store)).toEqual(["note mem_a1"]);
  });
});

describe("MemoryWriter.forget", () => {
  it("removes the item", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, TRIP_1);
    addRow(store, "mem_a2", USER_A, null);
    await writer.forget(USER_A, TRIP_1, "mem_a1");
    await writer.forget(USER_A, TRIP_1, "mem_a2");
    expect(store.rows).toEqual([]);
  });

  it("refuses an ID that doesn't exist", async () => {
    const { writer } = setUp();
    await expect(writer.forget(USER_A, TRIP_1, MISSING_ID)).rejects.toThrow(
      new RuleError(NO_SUCH_MEMORY_ITEM),
    );
  });

  it("refuses another user's item, with the same error", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_b1", USER_B, TRIP_1);
    await expect(writer.forget(USER_A, TRIP_1, "mem_b1")).rejects.toThrow(
      new RuleError(NO_SUCH_MEMORY_ITEM),
    );
    expect(store.rows).toHaveLength(1);
  });

  it("refuses another trip's item, with the same error", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, TRIP_2);
    await expect(writer.forget(USER_A, TRIP_1, "mem_a1")).rejects.toThrow(
      new RuleError(NO_SUCH_MEMORY_ITEM),
    );
    expect(store.rows).toHaveLength(1);
  });
});

describe("MemoryWriter on a started trip", () => {
  it("refuses to add, update, or forget a trip item", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_s1", USER_A, STARTED_TRIP);
    await expect(writer.add(USER_A, STARTED_TRIP, "new")).rejects.toThrow(
      STARTED,
    );
    await expect(
      writer.update(USER_A, STARTED_TRIP, "mem_s1", "new"),
    ).rejects.toThrow(STARTED);
    await expect(writer.forget(USER_A, STARTED_TRIP, "mem_s1")).rejects.toThrow(
      STARTED,
    );
    expect(textsOf(store)).toEqual(["note mem_s1"]);
  });

  it("still adds, updates, and forgets user items", async () => {
    const { store, writer } = setUp();
    addRow(store, "mem_a1", USER_A, null);
    await writer.update(USER_A, STARTED_TRIP, "mem_a1", "changed");
    const added = await writer.add(USER_A, null, "added");
    expect(textsOf(store)).toEqual(["changed", "added"]);
    await writer.forget(USER_A, STARTED_TRIP, added.id);
    expect(textsOf(store)).toEqual(["changed"]);
  });
});
