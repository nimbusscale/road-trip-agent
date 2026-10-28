import type { Settings } from "../config/settings.schema.js";
import {
  FAKE_POOL,
  FakeMemoryStore,
} from "../persistence/fake-memory-store.js";
import { FakeTranscriptLineStore } from "../persistence/fake-transcript-line-store.js";
import { MemoryReader } from "../persistence/memory-reader.js";
import { MemoryWriter } from "../persistence/memory-writer.js";
import { Session } from "../persistence/session.js";
import { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { fakePlacesAccess } from "../tools/places-session.fake.js";
import { fakeRoutingAccess } from "../tools/routing-session.fake.js";
import { fakeWeatherAccess } from "../tools/weather-session.fake.js";
import type { Conversation, CoordinatorGiven } from "./coordinator.js";

// What the coordinator is given, for tests, with fakes for Postgres (DEVELOPMENT.md
// section 5).

export const AGENT_SESSION_ID = "7c0f5d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

export function coordinatorGiven(settings: Settings): CoordinatorGiven {
  const memoryStore = new FakeMemoryStore();
  const transcripts = new FakeTranscriptLineStore();
  const trips = setUp();
  return {
    settings,
    processEnv: {},
    trip: { ...trips, settings },
    places: fakePlacesAccess(trips),
    routing: fakeRoutingAccess(trips),
    weather: fakeWeatherAccess(trips),
    memory: {
      writer: new MemoryWriter({
        pool: FAKE_POOL,
        makeStore: () => memoryStore,
        hasTripStarted: () => Promise.resolve(null),
        limits: settings,
      }),
      reader: new MemoryReader({
        pool: FAKE_POOL,
        makeStore: () => memoryStore,
      }),
      limits: settings,
    },
    transcripts: new TranscriptAdapter({
      pool: FAKE_POOL,
      makeStore: () => transcripts,
    }),
  };
}

export function conversation(): Conversation {
  return {
    session: new Session({
      id: "session_aaaaaaaa",
      tripId: "trip_aaaaaaaa",
      createdDateTime: new Date("2026-10-23T12:00:00Z"),
      title: "Utah",
      agentSessionId: AGENT_SESSION_ID,
    }),
    userId: "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f",
  };
}
