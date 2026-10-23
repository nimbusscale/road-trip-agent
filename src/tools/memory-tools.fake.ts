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

// The memory tools for tests, with fakes for Postgres (DEVELOPMENT.md section 5).

export const STARTED_TRIP = "trip_ssssssss";

export const LIMITS = {
  maximumMemoryItems: 3,
  maximumMemoryItemCharacters: 30,
};

export interface Tools {
  read: () => Promise<string>;
  add: (input: unknown) => Promise<ToolReply>;
  update: (input: unknown) => Promise<ToolReply>;
  forget: (input: unknown) => Promise<ToolReply>;
}

// One session's memory tools. Sessions made from one store share its rows, as two
// users' sessions share the database. Only STARTED_TRIP has started.
export function toolsFor(
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

export function textOf(reply: ToolReply): string {
  return reply.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

// Adds an item through the tool, and returns its ID from the reply.
export async function added(
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

// Puts a STARTED_TRIP item straight into the store, as if it were added before the
// trip started, and returns its ID.
export function startedTripItem(
  store: FakeMemoryStore,
  userId: string,
): string {
  const id = "mem_tttttttt";
  store.rows.push({
    id,
    userId,
    tripId: STARTED_TRIP,
    text: "Skip I-35.",
    createdDateTime: new Date("2026-10-15T12:00:00Z"),
  });
  return id;
}
