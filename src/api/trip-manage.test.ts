import { describe, expect, it } from "vitest";

import { TEST_USER_ID } from "../auth/test-tokens.js";
import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { errorResponseSchema } from "../shared/error.schema.js";
import { tripListResponseSchema } from "../shared/trip.schema.js";
import {
  type ChatApi,
  chatApi,
  eventsOf,
  openedSession,
} from "./chat-api.fake.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");
// Just after midnight on the Moab trip's start date, at Grand Junction.
const START_DAY = new Date("2027-10-10T06:00:30Z");

async function startTrip(chat: ChatApi): Promise<string> {
  const events = await eventsOf(
    await chat.asUser("POST", "/api/trips", { text: "Plan a trip to Utah" }),
  );
  return openedSession(events).tripId;
}

async function addMoabTrip(chat: ChatApi): Promise<string> {
  const { trip, places } = exampleMoabTrip({ id: TEST_USER_ID });
  await chat.tripStore.add(trip);
  chat.tripStore.places.rows.push(
    ...places.map((place) => ({ tripId: trip.id, place })),
  );
  return trip.id;
}

async function tripCount(chat: ChatApi): Promise<number> {
  const response = await chat.asUser("GET", "/api/trips");
  return tripListResponseSchema.parse(await response.json()).trips.length;
}

describe("deleting a trip", () => {
  it("removes the trip", async () => {
    const chat = await chatApi(PLANNING);
    const tripId = await startTrip(chat);
    const deleted = await chat.asUser("DELETE", `/api/trips/${tripId}`);
    expect(deleted.status).toBe(204);
    expect(await tripCount(chat)).toBe(0);
    expect((await chat.asUser("GET", `/api/trips/${tripId}`)).status).toBe(404);
  });

  it("refuses another user's trip as if it didn't exist", async () => {
    const chat = await chatApi(PLANNING);
    const tripId = await startTrip(chat);
    const deleted = await chat.asOtherUser("DELETE", `/api/trips/${tripId}`);
    expect(deleted.status).toBe(404);
    expect(await tripCount(chat)).toBe(1);
  });

  it("refuses while one of its sessions has a turn running", async () => {
    const chat = await chatApi(PLANNING);
    const hold = Promise.withResolvers<undefined>();
    chat.sdk.beforeLaterParts = () => hold.promise;
    const started = await chat.asUser("POST", "/api/trips", { text: "Utah" });
    const tripId = chat.sessionStore.rows[0]?.tripId ?? "";
    const deleted = await chat.asUser("DELETE", `/api/trips/${tripId}`);
    expect(deleted.status).toBe(409);
    expect(errorResponseSchema.parse(await deleted.json()).error).toBe(
      "The reply to your last message isn't finished yet.",
    );
    hold.resolve(undefined);
    await eventsOf(started);
    expect(await tripCount(chat)).toBe(1);
  });

  it("deletes a trip that has started", async () => {
    const chat = await chatApi(START_DAY);
    const tripId = await addMoabTrip(chat);
    const deleted = await chat.asUser("DELETE", `/api/trips/${tripId}`);
    expect(deleted.status).toBe(204);
    expect(await tripCount(chat)).toBe(0);
  });
});

describe("downloading the plan", () => {
  async function moabChat(): Promise<{ chat: ChatApi; tripId: string }> {
    const chat = await chatApi(PLANNING);
    return { chat, tripId: await addMoabTrip(chat) };
  }

  it("sends each detail as a text file", async () => {
    const { chat, tripId } = await moabChat();
    for (const path of ["plan", "plan/full"]) {
      const response = await chat.asUser("GET", `/api/trips/${tripId}/${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
      const text = await response.text();
      expect(text).toMatch(/^focus: Arches and Capitol Reef\n/);
      expect(text).toContain("\n\nThe whole itinerary.\n");
    }
  });

  it("sends a started trip's plan too", async () => {
    const chat = await chatApi(START_DAY);
    const tripId = await addMoabTrip(chat);
    const response = await chat.asUser("GET", `/api/trips/${tripId}/plan`);
    expect(response.status).toBe(200);
  });

  it("refuses another user's trip as if it didn't exist", async () => {
    const { chat, tripId } = await moabChat();
    const response = await chat.asOtherUser("GET", `/api/trips/${tripId}/plan`);
    expect(response.status).toBe(404);
  });
});
