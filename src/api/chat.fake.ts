import { CoordinatorTurns } from "../agent/coordinator-turns.js";
import { coordinatorGiven } from "../agent/coordinator.fake.js";
import { FakeSdk } from "../agent/run-turn.fake.js";
import {
  FAKE_POOL,
  FakeMemoryStore,
} from "../persistence/fake-memory-store.js";
import { MemoryReader } from "../persistence/memory-reader.js";
import { MemoryWriter } from "../persistence/memory-writer.js";
import { FakeSessionRowStore } from "../persistence/fake-session-row-store.js";
import { FakeTranscriptLineStore } from "../persistence/fake-transcript-line-store.js";
import { SessionReader } from "../persistence/session-reader.js";
import { SessionWriter } from "../persistence/session-writer.js";
import { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import { tripStartedCheckUsing } from "../persistence/trip-started-check.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { fakePlacesAccess } from "../tools/places-session.fake.js";
import type { FakeTripStore } from "../persistence/trip-store.fake.js";
import type { ChatDependencies } from "./chat-dependencies.js";

// The chat's dependencies for tests, with fakes for Postgres and the Agent SDK
// (DEVELOPMENT.md section 5).
export interface ChatSetUp {
  chat: ChatDependencies;
  sdk: FakeSdk;
  tripStore: FakeTripStore;
  sessionStore: FakeSessionRowStore;
  transcriptStore: FakeTranscriptLineStore;
  memoryStore: FakeMemoryStore;
}

// `now` is the time the started-trip checks go by.
export function chatSetUp(now: Date): ChatSetUp {
  const trips = setUp();
  const sessionStore = new FakeSessionRowStore();
  const transcriptStore = new FakeTranscriptLineStore();
  const transcripts = new TranscriptAdapter({
    pool: trips.pool,
    makeStore: () => transcriptStore,
  });
  const memoryStore = new FakeMemoryStore();
  const memory = fakeMemoryAccess(memoryStore, trips, now);
  const coordinator = {
    ...coordinatorGiven(trips.settings),
    memory: { ...memory, limits: trips.settings },
    trip: {
      writer: trips.writer,
      reader: trips.reader,
      settings: trips.settings,
      now: trips.now,
    },
    places: fakePlacesAccess(trips),
    transcripts,
  };
  const sdk = new FakeSdk();
  const sessions = { pool: trips.pool, makeStore: () => sessionStore };
  return {
    chat: {
      trips: { reader: trips.reader, writer: trips.writer },
      sessions: {
        reader: new SessionReader(sessions),
        writer: new SessionWriter(sessions),
      },
      memory,
      turns: new CoordinatorTurns({
        coordinator,
        runTurn: sdk.runTurn,
        now: () => now,
      }),
      transcripts,
      now: () => now,
    },
    sdk,
    tripStore: trips.store,
    sessionStore,
    transcriptStore,
    memoryStore,
  };
}

// One memory for the coordinator's tools and the chat view's memory list. A trip
// memory item can't change once the trip has started by `now`.
function fakeMemoryAccess(
  memoryStore: FakeMemoryStore,
  trips: ReturnType<typeof setUp>,
  now: Date,
): ChatDependencies["memory"] {
  return {
    reader: new MemoryReader({ pool: FAKE_POOL, makeStore: () => memoryStore }),
    writer: new MemoryWriter({
      pool: FAKE_POOL,
      makeStore: () => memoryStore,
      hasTripStarted: tripStartedCheckUsing(
        () => trips.store,
        () => now,
      ),
      limits: trips.settings,
    }),
  };
}
