import type {
  SessionKey,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";

import { FakeTranscriptLineStore } from "./fake-transcript-line-store.js";
import type { Queryable } from "./queryable.js";
import { TranscriptAdapter } from "./transcript-adapter.js";

const SESSION_ID = "8ab57545-dd4c-4e3c-8094-34b27ec7249a";
const COORDINATOR: SessionKey = {
  projectKey: "-app",
  sessionId: SESSION_ID,
};
const WORKER: SessionKey = {
  ...COORDINATOR,
  subpath: "subagents/agent-a735965433a7c5b2f",
};
const POOL: Queryable = {
  query: () => Promise.resolve({ rows: [] }),
};

function lineOf(uuid: string): SessionStoreEntry {
  return { type: "user", uuid, message: { content: uuid } };
}

function setUp(): {
  store: FakeTranscriptLineStore;
  adapter: TranscriptAdapter;
} {
  const store = new FakeTranscriptLineStore();
  const adapter = new TranscriptAdapter({ pool: POOL, makeStore: () => store });
  return { store, adapter };
}

// Stands in for the SDK with sessionStoreFlush "eager": it sends each batch as soon as
// it's written, without waiting for the batch before it to be stored.
function sendLikeTheSdk(
  adapter: TranscriptAdapter,
  batches: readonly (readonly [SessionKey, SessionStoreEntry[]])[],
): Promise<void>[] {
  return batches.map(([key, entries]) => adapter.append(key, entries));
}

function uuidsOf(lines: readonly SessionStoreEntry[] | null): unknown[] {
  return (lines ?? []).map((line) => line.uuid);
}

describe("TranscriptAdapter", () => {
  it("stores lines in the order sent, even when an earlier batch is slow", async () => {
    const { store, adapter } = setUp();
    store.beforeAdd = (lines) =>
      new Promise((resolve) => {
        setTimeout(resolve, lines[0]?.uuid === "a" ? 30 : 0);
      });
    await Promise.all(
      sendLikeTheSdk(adapter, [
        [COORDINATOR, [lineOf("a"), lineOf("b")]],
        [COORDINATOR, [lineOf("c")]],
        [COORDINATOR, [lineOf("d")]],
      ]),
    );
    expect(uuidsOf(await adapter.load(COORDINATOR))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("gives a failed batch back to the SDK, and still stores the batches after it", async () => {
    const { store, adapter } = setUp();
    store.beforeAdd = (lines) =>
      lines[0]?.uuid === "b"
        ? Promise.reject(new Error("The database is down."))
        : Promise.resolve();
    const [first, second, third] = sendLikeTheSdk(adapter, [
      [COORDINATOR, [lineOf("a")]],
      [COORDINATOR, [lineOf("b")]],
      [COORDINATOR, [lineOf("c")]],
    ]);
    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow("The database is down.");
    await expect(third).resolves.toBeUndefined();
    expect(uuidsOf(await adapter.load(COORDINATOR))).toEqual(["a", "c"]);
  });

  it("keeps each worker's transcript apart from the coordinator's", async () => {
    const { adapter } = setUp();
    await Promise.all(
      sendLikeTheSdk(adapter, [
        [COORDINATOR, [lineOf("a")]],
        [WORKER, [lineOf("w1")]],
        [COORDINATOR, [lineOf("b")]],
        [WORKER, [lineOf("w2")]],
      ]),
    );
    expect(uuidsOf(await adapter.load(COORDINATOR))).toEqual(["a", "b"]);
    expect(uuidsOf(await adapter.load(WORKER))).toEqual(["w1", "w2"]);
    expect(await adapter.listSubkeys(COORDINATOR)).toEqual([WORKER.subpath]);
  });

  it("finds a session's lines under any project key", async () => {
    const { adapter } = setUp();
    await adapter.append(COORDINATOR, [lineOf("a")]);
    const onTheServer = { ...COORDINATOR, projectKey: "-home-joe-road-trip" };
    expect(uuidsOf(await adapter.load(onTheServer))).toEqual(["a"]);
  });

  it("returns null for a transcript that was never written", async () => {
    const { adapter } = setUp();
    expect(await adapter.load(COORDINATOR)).toBeNull();
    expect(await adapter.listSubkeys(COORDINATOR)).toEqual([]);
  });
});
