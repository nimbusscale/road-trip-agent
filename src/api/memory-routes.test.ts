import { describe, expect, it } from "vitest";

import { FORGOTTEN_LINE } from "../agent/app-lines.js";
import { TEST_USER_ID } from "../auth/test-tokens.js";
import { errorResponseSchema } from "../shared/error.schema.js";
import { memoryResponseSchema } from "../shared/memory.schema.js";
import { sessionResponseSchema } from "../shared/session.schema.js";
import {
  type ChatApi,
  chatApi,
  eventsOf,
  OTHER_USER_ID,
  openedSession,
} from "./chat-api.fake.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");

interface Opened {
  chat: ChatApi;
  sessionId: string;
  tripId: string;
}

// A trip with a session, and memory of every kind: the user's, this trip's, another
// trip's, and another user's.
async function openTrip(): Promise<Opened> {
  const chat = await chatApi(PLANNING);
  const { tripId, sessionId } = openedSession(
    await eventsOf(
      await chat.asUser("POST", "/api/trips", { text: "Plan a trip to Utah" }),
    ),
  );
  const writer = chat.chat.memory.writer;
  await writer.add(TEST_USER_ID, null, "Likes breweries.");
  await writer.add(TEST_USER_ID, tripId, "Chose the hotel for its pool.");
  // Straight into the store, since the writer would look the trip up.
  chat.memoryStore.rows.push({
    id: "mem_otherone",
    userId: TEST_USER_ID,
    tripId: "trip_otherone",
    text: "Wants a beach day.",
    createdDateTime: PLANNING,
  });
  await writer.add(OTHER_USER_ID, null, "Never drives at night.");
  return { chat, sessionId, tripId };
}

async function memoryOf({ chat, sessionId }: Opened) {
  const response = await chat.asUser(
    "GET",
    `/api/sessions/${sessionId}/memory`,
  );
  return memoryResponseSchema.parse(await response.json());
}

function textsOf(items: readonly { text: string }[]): string[] {
  return items.map((item) => item.text);
}

describe("the chat view's memory list", () => {
  it("lists the user's memory and this trip's memory, apart", async () => {
    const memory = await memoryOf(await openTrip());
    expect(textsOf(memory.userMemory)).toEqual(["Likes breweries."]);
    expect(textsOf(memory.tripMemory)).toEqual([
      "Chose the hotel for its pool.",
    ]);
  });

  it("refuses another user's session as if it didn't exist", async () => {
    const { chat, sessionId } = await openTrip();
    const response = await chat.asOtherUser(
      "GET",
      `/api/sessions/${sessionId}/memory`,
    );
    expect(response.status).toBe(404);
  });
});

describe("forgetting a memory item from the chat view", () => {
  it("removes the item, and tells the coordinator on the next message only", async () => {
    const opened = await openTrip();
    const { chat, sessionId } = opened;
    const [item] = (await memoryOf(opened)).userMemory;
    const forgotten = await chat.asUser(
      "DELETE",
      `/api/sessions/${sessionId}/memory/${item?.id ?? ""}`,
    );
    expect(forgotten.status).toBe(204);
    expect((await memoryOf(opened)).userMemory).toEqual([]);
    const messages = `/api/sessions/${sessionId}/messages`;
    await eventsOf(await chat.asUser("POST", messages, { text: "Five days." }));
    await eventsOf(await chat.asUser("POST", messages, { text: "Six days." }));
    expect(chat.sdk.calls.map((call) => call.message).slice(1)).toEqual([
      `${FORGOTTEN_LINE}\n\nFive days.`,
      "Six days.",
    ]);
  });

  it("shows the user's own words in the session, without the line", async () => {
    const opened = await openTrip();
    const { chat, sessionId } = opened;
    const [item] = (await memoryOf(opened)).tripMemory;
    await chat.asUser(
      "DELETE",
      `/api/sessions/${sessionId}/memory/${item?.id ?? ""}`,
    );
    await eventsOf(
      await chat.asUser("POST", `/api/sessions/${sessionId}/messages`, {
        text: "Five days.",
      }),
    );
    const session = await chat.asUser("GET", `/api/sessions/${sessionId}`);
    const { messages } = sessionResponseSchema.parse(await session.json());
    expect(messages.at(-2)).toEqual({ role: "user", text: "Five days." });
  });

  it("refuses another trip's item and another user's item, and keeps them", async () => {
    const { chat, sessionId } = await openTrip();
    const theirs = chat.memoryStore.rows.filter(
      (row) => row.userId === OTHER_USER_ID || row.tripId === "trip_otherone",
    );
    for (const row of theirs) {
      const response = await chat.asUser(
        "DELETE",
        `/api/sessions/${sessionId}/memory/${row.id}`,
      );
      expect(response.status).toBe(400);
      expect(errorResponseSchema.parse(await response.json()).error).toBe(
        "No such memory item.",
      );
    }
    expect(chat.memoryStore.rows).toHaveLength(4);
  });
});
