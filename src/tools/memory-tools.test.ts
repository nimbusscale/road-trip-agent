import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import {
  FAKE_POOL,
  FakeMemoryStore,
} from "../persistence/fake-memory-store.js";
import { MemoryReader } from "../persistence/memory-reader.js";
import { MemoryWriter } from "../persistence/memory-writer.js";
import {
  addMemoryItemTool,
  forgetMemoryItemTool,
  readMemoryTool,
  updateMemoryItemTool,
} from "./memory-tools.js";
import type { MemorySession } from "./memory-session.js";
import type { ToolReply } from "./tool-reply.js";

const USER_A = "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f";
const USER_B = "7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a";
const TRIP_1 = "trip_aaaaaaaa";
const TRIP_2 = "trip_bbbbbbbb";
const STARTED_TRIP = "trip_ssssssss";
const MISSING_ID = "mem_zzzzzzzz";
const NO_SUCH_ITEM = "Nothing was changed. No such memory item.";

const LIMITS = { maximumMemoryItems: 3, maximumMemoryItemCharacters: 30 };

interface Tools {
  read: () => Promise<string>;
  add: (input: unknown) => Promise<ToolReply>;
  update: (input: unknown) => Promise<ToolReply>;
  forget: (input: unknown) => Promise<ToolReply>;
}

// One session's memory tools, with fakes for Postgres (DEVELOPMENT.md section 5).
// Sessions made from one store share its rows, as two users' sessions share the
// database.
function toolsFor(
  store: FakeMemoryStore,
  userId: string,
  tripId: string,
): Tools {
  const session: MemorySession = {
    userId,
    tripId,
    writer: new MemoryWriter({
      pool: FAKE_POOL,
      makeStore: () => store,
      hasTripStarted: (connection, id) =>
        Promise.resolve(
          id === STARTED_TRIP ? new CalendarDate(2027, 10, 10) : null,
        ),
      limits: LIMITS,
    }),
    reader: new MemoryReader({ pool: FAKE_POOL, makeStore: () => store }),
    limits: LIMITS,
  };
  const readTool = readMemoryTool(session);
  return {
    read: async () => textOf(await readTool.handler({})),
    add: addMemoryItemTool(session).handler,
    update: updateMemoryItemTool(session).handler,
    forget: forgetMemoryItemTool(session).handler,
  };
}

function textOf(reply: ToolReply): string {
  return reply.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

// Adds an item through the tool, and returns its ID from the reply.
async function added(
  tools: Tools,
  memory: "user" | "trip",
  text: string,
): Promise<string> {
  const reply = textOf(await tools.add({ memory, text }));
  const id = /mem_\w+/.exec(reply)?.[0];
  if (id === undefined) {
    throw new Error(`No item ID in the reply: ${reply}`);
  }
  return id;
}

function errorText(reply: ToolReply): string {
  expect(reply.isError).toBe(true);
  return textOf(reply);
}

describe("read_memory", () => {
  it("gives the counts and limits when memory is empty", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    expect(await tools.read()).toBe(
      ["User memory: 0 of 3 items.", "This trip's memory: 0 of 3 items."].join(
        "\n",
      ),
    );
  });

  it("gives each item with its ID, user or trip, and text, in the order added", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    const chains = await added(tools, "user", "We never eat at chains.");
    const lodge = await added(tools, "trip", "Picked the lodge for its pool.");
    expect(await tools.read()).toBe(
      [
        "User memory: 1 of 3 items.",
        "This trip's memory: 1 of 3 items.",
        `- ${chains} (user): We never eat at chains.`,
        `- ${lodge} (trip): Picked the lodge for its pool.`,
      ].join("\n"),
    );
  });

  it("leaves out another user's memory and another trip's memory", async () => {
    const store = new FakeMemoryStore();
    const own = toolsFor(store, USER_A, TRIP_1);
    await added(toolsFor(store, USER_B, TRIP_2), "user", "Posh hotels only.");
    await added(toolsFor(store, USER_B, TRIP_2), "trip", "Skip I-35.");
    await added(toolsFor(store, USER_A, TRIP_2), "trip", "Slow mornings.");
    const chains = await added(own, "user", "We never eat at chains.");
    expect(await own.read()).toBe(
      [
        "User memory: 1 of 3 items.",
        "This trip's memory: 0 of 3 items.",
        `- ${chains} (user): We never eat at chains.`,
      ].join("\n"),
    );
  });

  it("shows user memory in every trip of the same user", async () => {
    const store = new FakeMemoryStore();
    const chains = await added(
      toolsFor(store, USER_A, TRIP_1),
      "user",
      "We never eat at chains.",
    );
    expect(await toolsFor(store, USER_A, TRIP_2).read()).toContain(
      `- ${chains} (user): We never eat at chains.`,
    );
  });
});

describe("add_memory_item", () => {
  it("adds to user memory or this trip's memory, and gives the new ID", async () => {
    const store = new FakeMemoryStore();
    const tools = toolsFor(store, USER_A, TRIP_1);
    const userReply = textOf(
      await tools.add({ memory: "user", text: "We never eat at chains." }),
    );
    const tripReply = textOf(
      await tools.add({ memory: "trip", text: "Skip I-35 this time." }),
    );
    expect(userReply).toMatch(/^Added mem_\w{8} to user memory\.$/);
    expect(tripReply).toMatch(/^Added mem_\w{8} to this trip's memory\.$/);
    expect(store.rows.map((row) => [row.userId, row.tripId])).toEqual([
      [USER_A, null],
      [USER_A, TRIP_1],
    ]);
  });

  it("refuses an add over the maximum items, gives the limit, and adds nothing", async () => {
    const store = new FakeMemoryStore();
    const tools = toolsFor(store, USER_A, TRIP_1);
    for (const text of ["one", "two", "three"]) {
      await added(tools, "user", text);
    }
    expect(errorText(await tools.add({ memory: "user", text: "four" }))).toBe(
      "Nothing was changed. User memory already holds 3 items, the most it can. Merge or forget items first.",
    );
    expect(store.rows).toHaveLength(3);
    // Trip memory has its own limit.
    await added(tools, "trip", "four");
  });

  it("refuses text over the maximum length, and gives the limit", async () => {
    const store = new FakeMemoryStore();
    const tools = toolsFor(store, USER_A, TRIP_1);
    const reply = await tools.add({ memory: "user", text: "x".repeat(31) });
    expect(errorText(reply)).toBe(
      "Nothing was changed. A memory item is at most 30 characters. This one is 31.",
    );
    expect(store.rows).toEqual([]);
  });

  it("refuses empty text", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    expect(errorText(await tools.add({ memory: "trip", text: "  " }))).toBe(
      "Nothing was changed. A memory item's text can't be empty.",
    );
  });

  it("refuses a trip item on a started trip, and still adds a user item", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, STARTED_TRIP);
    expect(
      errorText(await tools.add({ memory: "trip", text: "Skip I-35." })),
    ).toBe(
      "Nothing was changed. This trip has started, so its memory can't change. Today is Sunday, October 10, 2027 at its start place, on or after its start date. User memory still can.",
    );
    await added(tools, "user", "We never eat at chains.");
  });
});

describe("update_memory_item", () => {
  it("replaces the text, and keeps the ID and which memory it's in", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    const id = await added(tools, "trip", "Skip I-35.");
    const reply = await tools.update({ itemId: id, text: "Take I-35." });
    expect(textOf(reply)).toBe(`Changed ${id}.`);
    expect(await tools.read()).toContain(`- ${id} (trip): Take I-35.`);
  });

  it("refuses another user's item with the same error as an ID that doesn't exist", async () => {
    const store = new FakeMemoryStore();
    const otherUsers = await added(
      toolsFor(store, USER_B, TRIP_1),
      "user",
      "Posh hotels only.",
    );
    const tools = toolsFor(store, USER_A, TRIP_1);
    const missing = await tools.update({ itemId: MISSING_ID, text: "Cheap." });
    const other = await tools.update({ itemId: otherUsers, text: "Cheap." });
    expect(errorText(missing)).toBe(NO_SUCH_ITEM);
    expect(errorText(other)).toBe(NO_SUCH_ITEM);
    expect(store.rows[0]?.text).toBe("Posh hotels only.");
  });

  it("refuses the user's own item from another trip", async () => {
    const store = new FakeMemoryStore();
    const otherTrip = await added(
      toolsFor(store, USER_A, TRIP_2),
      "trip",
      "Skip I-35.",
    );
    const reply = await toolsFor(store, USER_A, TRIP_1).update({
      itemId: otherTrip,
      text: "Take I-35.",
    });
    expect(errorText(reply)).toBe(NO_SUCH_ITEM);
  });

  it("refuses text over the maximum length, and gives the limit", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    const id = await added(tools, "user", "We never eat at chains.");
    const reply = await tools.update({ itemId: id, text: "x".repeat(31) });
    expect(errorText(reply)).toBe(
      "Nothing was changed. A memory item is at most 30 characters. This one is 31.",
    );
  });

  it("says when the ID is another kind", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    const reply = await tools.update({ itemId: "stay_k7m2x9qa", text: "x" });
    expect(errorText(reply)).toBe(
      "Nothing was changed. stay_k7m2x9qa is a stay ID, not a memory item ID.",
    );
  });
});

describe("forget_memory_item", () => {
  it("removes the item", async () => {
    const tools = toolsFor(new FakeMemoryStore(), USER_A, TRIP_1);
    const id = await added(tools, "user", "We never eat at chains.");
    expect(textOf(await tools.forget({ itemId: id }))).toBe(`Forgot ${id}.`);
    expect(await tools.read()).not.toContain(id);
  });

  it("refuses another user's item with the same error as an ID that doesn't exist", async () => {
    const store = new FakeMemoryStore();
    const otherUsers = await added(
      toolsFor(store, USER_B, TRIP_1),
      "user",
      "Posh hotels only.",
    );
    const tools = toolsFor(store, USER_A, TRIP_1);
    expect(errorText(await tools.forget({ itemId: MISSING_ID }))).toBe(
      NO_SUCH_ITEM,
    );
    expect(errorText(await tools.forget({ itemId: otherUsers }))).toBe(
      NO_SUCH_ITEM,
    );
    expect(store.rows).toHaveLength(1);
  });

  it("refuses a trip item on a started trip, and still forgets a user item", async () => {
    const store = new FakeMemoryStore();
    const tools = toolsFor(store, USER_A, STARTED_TRIP);
    // Added before the trip started.
    store.rows.push({
      id: "mem_tttttttt",
      userId: USER_A,
      tripId: STARTED_TRIP,
      text: "Skip I-35.",
      createdDateTime: new Date("2026-10-15T12:00:00Z"),
    });
    const userItem = await added(tools, "user", "We never eat at chains.");
    expect(errorText(await tools.forget({ itemId: "mem_tttttttt" }))).toMatch(
      /^Nothing was changed\. This trip has started/,
    );
    expect(textOf(await tools.forget({ itemId: userItem }))).toBe(
      `Forgot ${userItem}.`,
    );
    expect(store.rows.map((row) => row.id)).toEqual(["mem_tttttttt"]);
  });
});
