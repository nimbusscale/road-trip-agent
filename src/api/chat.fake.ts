import { CoordinatorTurns } from "../agent/coordinator-turns.js";
import { coordinatorGiven } from "../agent/coordinator.fake.js";
import { FakeSdk } from "../agent/run-turn.fake.js";
import { FakeSessionRowStore } from "../persistence/fake-session-row-store.js";
import { FakeTranscriptLineStore } from "../persistence/fake-transcript-line-store.js";
import { SessionReader } from "../persistence/session-reader.js";
import { SessionWriter } from "../persistence/session-writer.js";
import { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import { setUp } from "../persistence/trip-writer.fake.js";
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
  const coordinator = {
    ...coordinatorGiven(trips.limits),
    trip: { writer: trips.writer, reader: trips.reader, limits: trips.limits },
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
  };
}
