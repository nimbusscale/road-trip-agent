import { describe, expect, it } from "vitest";

import { errorResponseSchema } from "../shared/error.schema.js";
import { tripListResponseSchema } from "../shared/trip.schema.js";
import { chatApi, eventsOf, openedSession } from "./chat-api.fake.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");

// Functional spec 10.4: a user never reaches another user's trips or sessions.
describe("the chat's routes, for another user's trip", () => {
  it("lists only the signed-in user's trips", async () => {
    const chat = await chatApi(PLANNING);
    await eventsOf(await chat.asUser("POST", "/api/trips", { text: "Utah" }));
    const mine = await chat.asUser("GET", "/api/trips");
    const theirs = await chat.asOtherUser("GET", "/api/trips");
    expect(tripListResponseSchema.parse(await mine.json()).trips).toHaveLength(
      1,
    );
    expect(tripListResponseSchema.parse(await theirs.json()).trips).toEqual([]);
  });

  it("refuses the trip and its session as if they didn't exist, and never runs a turn", async () => {
    const chat = await chatApi(PLANNING);
    const { tripId, sessionId } = openedSession(
      await eventsOf(await chat.asUser("POST", "/api/trips", { text: "Utah" })),
    );
    const message = { text: "Make it upscale." };
    const responses = [
      await chat.asOtherUser("GET", `/api/trips/${tripId}`),
      await chat.asOtherUser("POST", `/api/trips/${tripId}/sessions`, message),
      await chat.asOtherUser("POST", `/api/sessions/${sessionId}/resume`),
      await chat.asOtherUser("GET", `/api/sessions/${sessionId}`),
      await chat.asOtherUser(
        "POST",
        `/api/sessions/${sessionId}/messages`,
        message,
      ),
    ];
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404, 404,
    ]);
    const [tripRefusal] = responses;
    expect(errorResponseSchema.parse(await tripRefusal?.json()).error).toBe(
      `There's no trip ${tripId}.`,
    );
    expect(chat.sdk.calls).toHaveLength(1);
    expect(chat.sessionStore.rows).toHaveLength(1);
  });
});
