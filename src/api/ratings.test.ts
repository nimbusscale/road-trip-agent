import { describe, expect, it } from "vitest";

import { FAKE_SPAN_ID } from "../agent/run-turn.fake.js";
import { TEST_USER_ID } from "../auth/test-tokens.js";
import { errorResponseSchema } from "../shared/error.schema.js";
import { sessionRatingResponseSchema } from "../shared/rating.schema.js";
import {
  type ChatApi,
  chatApi,
  eventsOf,
  openedSession,
} from "./chat-api.fake.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");

async function startTrip(chat: ChatApi) {
  const events = await eventsOf(
    await chat.asUser("POST", "/api/trips", { text: "Plan a trip to Utah" }),
  );
  return openedSession(events);
}

describe("rating a turn or a session", () => {
  it("saves a turn's rating and note on its span, as the user", async () => {
    const chat = await chatApi(PLANNING);
    const { sessionId } = await startTrip(chat);
    const response = await chat.asUser(
      "PUT",
      `/api/sessions/${sessionId}/turns/${FAKE_SPAN_ID}/rating`,
      { rating: "up", note: " Good pick. " },
    );
    expect(response.status).toBe(204);
    expect(chat.ratings.saved).toEqual([
      {
        kind: "turn",
        id: FAKE_SPAN_ID,
        rating: { rating: "up", note: "Good pick.", userId: TEST_USER_ID },
      },
    ]);
  });

  // Phoenix knows the session by the Agent SDK's ID, not the app's.
  it("saves a session's rating on its agent session ID", async () => {
    const chat = await chatApi(PLANNING);
    const { sessionId, agentSessionId } = await startTrip(chat);
    const response = await chat.asUser(
      "PUT",
      `/api/sessions/${sessionId}/rating`,
      { rating: "down", note: "" },
    );
    expect(response.status).toBe(204);
    expect(chat.ratings.saved).toEqual([
      {
        kind: "session",
        id: agentSessionId,
        rating: { rating: "down", note: "", userId: TEST_USER_ID },
      },
    ]);
  });

  it("reads back the user's last rating of the session, or null when there's none", async () => {
    const chat = await chatApi(PLANNING);
    const { sessionId } = await startTrip(chat);
    const path = `/api/sessions/${sessionId}/rating`;
    const before = await chat.asUser("GET", path);
    await chat.asUser("PUT", path, { rating: "down", note: "Too long." });
    await chat.asUser("PUT", path, { rating: "up", note: "Better now." });
    const after = await chat.asUser("GET", path);
    expect(sessionRatingResponseSchema.parse(await before.json())).toEqual({
      rating: null,
    });
    expect(sessionRatingResponseSchema.parse(await after.json())).toEqual({
      rating: { rating: "up", note: "Better now." },
    });
  });

  it("refuses a rating of another user's session, as if it weren't there", async () => {
    const chat = await chatApi(PLANNING);
    const { sessionId } = await startTrip(chat);
    const responses = await Promise.all([
      chat.asOtherUser("GET", `/api/sessions/${sessionId}/rating`),
      chat.asOtherUser("PUT", `/api/sessions/${sessionId}/rating`, {
        rating: "up",
        note: "",
      }),
      chat.asOtherUser(
        "PUT",
        `/api/sessions/${sessionId}/turns/${FAKE_SPAN_ID}/rating`,
        { rating: "up", note: "" },
      ),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404,
    ]);
    expect(chat.ratings.saved).toEqual([]);
  });

  it("refuses a span ID that isn't 16 hex characters, and a rating that isn't up or down", async () => {
    const chat = await chatApi(PLANNING);
    const { sessionId } = await startTrip(chat);
    const badSpan = await chat.asUser(
      "PUT",
      `/api/sessions/${sessionId}/turns/not-a-span/rating`,
      { rating: "up", note: "" },
    );
    const badRating = await chat.asUser(
      "PUT",
      `/api/sessions/${sessionId}/rating`,
      { rating: "sideways", note: "" },
    );
    expect([badSpan.status, badRating.status]).toEqual([400, 400]);
    expect(errorResponseSchema.parse(await badSpan.json()).error).toBe(
      "A span ID is 16 hex characters.",
    );
    expect(errorResponseSchema.parse(await badRating.json()).error).toBe(
      "A rating is up or down.",
    );
    expect(chat.ratings.saved).toEqual([]);
  });

  it("says the rating wasn't saved when Phoenix can't be reached", async () => {
    const chat = await chatApi(PLANNING);
    const { sessionId } = await startTrip(chat);
    chat.ratings.reachable = false;
    const response = await chat.asUser(
      "PUT",
      `/api/sessions/${sessionId}/rating`,
      { rating: "up", note: "" },
    );
    expect(response.status).toBe(503);
    expect(errorResponseSchema.parse(await response.json()).error).toBe(
      "The rating wasn't saved, since the app can't reach Phoenix.",
    );
  });
});
