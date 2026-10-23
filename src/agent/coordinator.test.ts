import { describe, expect, it } from "vitest";

import { EXAMPLE_SETTINGS } from "../domain/example-trip-parts.fake.js";
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
import {
  type Conversation,
  type CoordinatorGiven,
  coordinatorOptions,
} from "./coordinator.js";

const SETTINGS = { ...EXAMPLE_SETTINGS, coordinatorModel: "claude-test-1-2" };
const AGENT_SESSION_ID = "7c0f5d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

function given(): CoordinatorGiven {
  const memoryStore = new FakeMemoryStore();
  const transcripts = new FakeTranscriptLineStore();
  return {
    settings: SETTINGS,
    processEnv: {},
    trip: setUp(),
    memory: {
      writer: new MemoryWriter({
        pool: FAKE_POOL,
        makeStore: () => memoryStore,
        hasTripStarted: () => Promise.resolve(null),
        limits: SETTINGS,
      }),
      reader: new MemoryReader({
        pool: FAKE_POOL,
        makeStore: () => memoryStore,
      }),
      limits: SETTINGS,
    },
    transcripts: new TranscriptAdapter({
      pool: FAKE_POOL,
      makeStore: () => transcripts,
    }),
  };
}

function conversation(resumed: boolean): Conversation {
  return {
    session: new Session({
      id: "session_aaaaaaaa",
      tripId: "trip_aaaaaaaa",
      createdDateTime: new Date("2026-10-23T12:00:00Z"),
      title: "Utah",
      agentSessionId: AGENT_SESSION_ID,
    }),
    userId: "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f",
    resumed,
  };
}

describe("coordinatorOptions", () => {
  it("uses the exact model ID from the settings", () => {
    expect(coordinatorOptions(given(), conversation(false)).model).toBe(
      "claude-test-1-2",
    );
  });

  it("gives only the trip and memory servers, with no built-in tools and no settings files", () => {
    const options = coordinatorOptions(given(), conversation(false));
    expect(Object.keys(options.mcpServers ?? {})).toEqual(["trip", "memory"]);
    expect(options.allowedTools).toEqual(["mcp__trip", "mcp__memory"]);
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
  });

  it("starts a new session under the ID the app chose", () => {
    const options = coordinatorOptions(given(), conversation(false));
    expect(options.sessionId).toBe(AGENT_SESSION_ID);
    expect(options.resume).toBeUndefined();
  });

  it("resumes a session from its transcript", () => {
    const options = coordinatorOptions(given(), conversation(true));
    expect(options.resume).toBe(AGENT_SESSION_ID);
    expect(options.sessionId).toBeUndefined();
    expect(options.sessionStoreFlush).toBe("eager");
  });
});
