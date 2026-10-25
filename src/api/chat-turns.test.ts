import { describe, expect, it, vi } from "vitest";

import { RESUMED_LINE } from "../agent/app-lines.js";
import { FAKE_USAGE } from "../agent/run-turn.fake.js";
import { TEST_USER_ID } from "../auth/test-tokens.js";
import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { Session } from "../persistence/session.js";
import { errorResponseSchema } from "../shared/error.schema.js";
import { sessionResponseSchema } from "../shared/session.schema.js";
import { tripPageResponseSchema } from "../shared/trip.schema.js";
import {
  type ChatApi,
  chatApi,
  eventsOf,
  openedSession,
} from "./chat-api.fake.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");
// The Moab trip starts October 10, 2027, at Grand Junction, on Mountain time: just
// after midnight on its start date.
const START_DAY = new Date("2027-10-10T06:00:30Z");
const REPLY = "Hello!\n\nWhere would you like to go?";

async function startTrip(chat: ChatApi): Promise<string> {
  const events = await eventsOf(
    await chat.asUser("POST", "/api/trips", { text: "Plan a trip to Utah" }),
  );
  return openedSession(events).sessionId;
}

function send(chat: ChatApi, sessionId: string, text: string) {
  return chat.asUser("POST", `/api/sessions/${sessionId}/messages`, { text });
}

describe("the chat's turns", () => {
  it("starts a trip and its session from the New trip form, and streams the reply", async () => {
    const chat = await chatApi(PLANNING);
    const events = await eventsOf(
      await chat.asUser("POST", "/api/trips", { text: "Plan a trip to Utah" }),
    );
    expect(events.map((event) => event.name)).toEqual([
      "session",
      "started",
      "message",
      "text",
      "text",
      "ended",
    ]);
    const [call] = chat.sdk.calls;
    expect(call?.message).toBe(
      "Today is Thursday, October 15, 2026.\n\nPlan a trip to Utah",
    );
    expect(call?.options.sessionId).toBe(
      chat.sessionStore.rows[0]?.agentSessionId,
    );
    expect(call?.options.resume).toBeUndefined();
  });

  // It goes on the turn's trace (systems design section 10).
  it("runs the turn for the signed-in user", async () => {
    const chat = await chatApi(PLANNING);
    await startTrip(chat);
    expect(chat.sdk.calls.map((call) => call.userId)).toEqual([TEST_USER_ID]);
  });

  it("resumes the conversation for each later message, and says when the user resumed it", async () => {
    const chat = await chatApi(PLANNING);
    const sessionId = await startTrip(chat);
    await eventsOf(await send(chat, sessionId, "Five days."));
    const resumed = await chat.asUser(
      "POST",
      `/api/sessions/${sessionId}/resume`,
    );
    await eventsOf(await send(chat, sessionId, "Make it six."));
    const agentSessionId = chat.sessionStore.rows[0]?.agentSessionId;
    expect(chat.sdk.calls.map((call) => call.options.resume)).toEqual([
      undefined,
      agentSessionId,
      agentSessionId,
    ]);
    expect(chat.sdk.calls.map((call) => call.message).slice(1)).toEqual([
      "Five days.",
      `Today is Thursday, October 15, 2026.\n${RESUMED_LINE}\n\nMake it six.`,
    ]);
    expect(sessionResponseSchema.parse(await resumed.json())).toEqual({
      sessionId,
      tripId: chat.sessionStore.rows[0]?.tripId,
      messages: [
        { role: "user", text: "Plan a trip to Utah" },
        { role: "coordinator", text: REPLY },
        { role: "user", text: "Five days." },
        { role: "coordinator", text: REPLY },
      ],
      turnRunning: false,
    });
  });

  it("streams each part of the turn for the raw view, in the order they happened", async () => {
    const chat = await chatApi(PLANNING);
    const sessionId = await startTrip(chat);
    chat.sdk.beforeReply = [
      { kind: "thinking", text: "The user gave a length." },
      {
        kind: "toolCall",
        name: "mcp__trip__update_trip_brief",
        input: { tripLengthInDays: 5 },
      },
      {
        kind: "toolReply",
        text: "The trip brief was updated.",
        isError: false,
      },
      {
        kind: "system",
        subtype: "api_retry",
        data: { attempt: 1, delayMs: 500 },
      },
    ];
    chat.sdk.replyParts = ["Five days it is."];
    const events = await eventsOf(await send(chat, sessionId, "Five days."));
    expect(events).toEqual([
      {
        name: "started",
        data: { model: "claude-fake-1", tools: [] },
      },
      { name: "message", data: { text: "Five days." } },
      { name: "thinking", data: { text: "The user gave a length." } },
      {
        name: "toolCall",
        data: {
          name: "mcp__trip__update_trip_brief",
          input: { tripLengthInDays: 5 },
        },
      },
      {
        name: "toolReply",
        data: { text: "The trip brief was updated.", isError: false },
      },
      {
        name: "system",
        data: { subtype: "api_retry", data: { attempt: 1, delayMs: 500 } },
      },
      { name: "text", data: { text: "Five days it is." } },
      {
        name: "ended",
        data: { failure: null, durationMs: 1000, usage: FAKE_USAGE },
      },
    ]);
  });

  it("finishes a turn whose stream was closed partway, and keeps the whole turn in the transcript", async () => {
    const chat = await chatApi(PLANNING);
    const sessionId = await startTrip(chat);
    const hold = Promise.withResolvers<undefined>();
    chat.sdk.beforeLaterParts = () => hold.promise;
    const response = await send(chat, sessionId, "Five days.");
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    hold.resolve(undefined);
    await vi.waitFor(() => {
      expect(chat.chat.turns.isRunning(sessionId)).toBe(false);
    });
    const shown = await chat.asUser("GET", `/api/sessions/${sessionId}`);
    expect(
      sessionResponseSchema.parse(await shown.json()).messages.at(-1),
    ).toEqual({ role: "coordinator", text: REPLY });
  });

  it("logs why a turn failed, and tells the browser it didn't finish", async () => {
    const chat = await chatApi(PLANNING);
    const sessionId = await startTrip(chat);
    chat.sdk.failure = "error_during_execution: API Error: 529 Overloaded";
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const events = await eventsOf(await send(chat, sessionId, "Five days."));
      expect(events.at(-1)).toEqual({
        name: "ended",
        data: {
          failure: "error_during_execution: API Error: 529 Overloaded",
          durationMs: 1000,
          usage: FAKE_USAGE,
        },
      });
      expect(logged).toHaveBeenCalledWith(
        `The turn in session ${sessionId} failed: error_during_execution: API Error: 529 Overloaded`,
      );
    } finally {
      logged.mockRestore();
    }
  });

  it("refuses a second message while the last turn is still running", async () => {
    const chat = await chatApi(PLANNING);
    const sessionId = await startTrip(chat);
    const hold = Promise.withResolvers<undefined>();
    chat.sdk.beforeLaterParts = () => hold.promise;
    const first = await send(chat, sessionId, "Five days.");
    const second = await send(chat, sessionId, "Six days.");
    expect(second.status).toBe(409);
    hold.resolve(undefined);
    await eventsOf(first);
    expect(chat.sdk.calls).toHaveLength(2);
  });
});

describe("the chat of a trip that has started", () => {
  async function startedTrip(): Promise<{ chat: ChatApi; tripId: string }> {
    const chat = await chatApi(START_DAY);
    const { trip, places } = exampleMoabTrip({ id: TEST_USER_ID });
    await chat.tripStore.add(trip);
    chat.tripStore.places.rows.push(
      ...places.map((place) => ({ tripId: trip.id, place })),
    );
    await chat.sessionStore.add(
      new Session({
        id: "session_k7m2x9qa",
        tripId: trip.id,
        createdDateTime: PLANNING,
        title: "Plan Moab",
        agentSessionId: "8ab57545-dd4c-4e3c-8094-34b27ec7249a",
      }),
    );
    return { chat, tripId: trip.id };
  }

  it("refuses a new message, a new session, and a resume, and runs no turn", async () => {
    const { chat, tripId } = await startedTrip();
    const responses = [
      await send(chat, "session_k7m2x9qa", "Swap the Day 2 dinner."),
      await chat.asUser("POST", `/api/trips/${tripId}/sessions`, {
        text: "Swap the Day 2 dinner.",
      }),
      await chat.asUser("POST", "/api/sessions/session_k7m2x9qa/resume"),
    ];
    expect(responses.map((response) => response.status)).toEqual([
      409, 409, 409,
    ]);
    expect(errorResponseSchema.parse(await responses[0]?.json()).error).toBe(
      "The trip has started, so its chat is closed. Today is Sunday, October 10, 2027 at its start place.",
    );
    expect(chat.sdk.calls).toEqual([]);
    expect(chat.sessionStore.rows).toHaveLength(1);
  });

  it("shows the trip page with the chat closed", async () => {
    const { chat, tripId } = await startedTrip();
    const page = await chat.asUser("GET", `/api/trips/${tripId}`);
    const body = tripPageResponseSchema.parse(await page.json());
    expect(body.chatClosed).toBe(true);
    expect(body.sessions.map((session) => session.title)).toEqual([
      "Plan Moab",
    ]);
  });
});
