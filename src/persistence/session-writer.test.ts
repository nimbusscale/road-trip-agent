import { describe, expect, it } from "vitest";

import { RuleError } from "../domain/rule-error.js";
import { ID_CHARACTERS } from "../ids/new-id.js";
import { FakeSessionRowStore } from "./fake-session-row-store.js";
import type { Connectable, TransactionClient } from "./queryable.js";
import { SessionWriter, TITLE_CHARACTERS, titleOf } from "./session-writer.js";

// Records each statement, so a test can see the add ran in a transaction.
class FakePool implements Connectable {
  readonly statements: string[] = [];

  connect(): Promise<TransactionClient> {
    return Promise.resolve({
      query: (text: string) => {
        this.statements.push(text);
        return Promise.resolve({ rows: [] });
      },
      release: () => undefined,
    });
  }
}

function setUp(): {
  pool: FakePool;
  store: FakeSessionRowStore;
  writer: SessionWriter;
} {
  const pool = new FakePool();
  const store = new FakeSessionRowStore();
  const writer = new SessionWriter({ pool, makeStore: () => store });
  return { pool, store, writer };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("SessionWriter.start", () => {
  it("saves a new session for the trip, in a transaction", async () => {
    const { pool, store, writer } = setUp();
    const session = await writer.start("trip_k7m2x9qa", "Plan a trip to Moab");
    expect(store.rows).toEqual([session]);
    expect(pool.statements).toEqual(["BEGIN", "COMMIT"]);
    expect(session.tripId).toBe("trip_k7m2x9qa");
    expect(session.title).toBe("Plan a trip to Moab");
    expect(session.id).toMatch(new RegExp(`^session_[${ID_CHARACTERS}]{8}$`));
  });

  it("gives each session its own agent session ID, a UUID for the SDK", async () => {
    const { writer } = setUp();
    const first = await writer.start("trip_k7m2x9qa", "Hello");
    const second = await writer.start("trip_k7m2x9qa", "Hello again");
    expect(first.agentSessionId).toMatch(UUID);
    expect(second.agentSessionId).not.toBe(first.agentSessionId);
  });

  it("refuses an empty first message, and saves nothing", async () => {
    const { store, writer } = setUp();
    await expect(writer.start("trip_k7m2x9qa", "  \n ")).rejects.toThrow(
      RuleError,
    );
    expect(store.rows).toEqual([]);
  });
});

describe("titleOf", () => {
  it("keeps a short message whole, on one line", () => {
    expect(titleOf("  Plan a trip\n to Moab  ")).toBe("Plan a trip to Moab");
  });

  it("cuts a long message at a word break", () => {
    const message =
      "Can we add a night in Big Sur and drop one in Santa Barbara instead of driving straight through?";
    const title = titleOf(message);
    expect(title).toBe(
      "Can we add a night in Big Sur and drop one in Santa Barbara…",
    );
    expect(title.length).toBeLessThanOrEqual(TITLE_CHARACTERS + 1);
  });

  it("cuts a first word longer than the limit where the limit falls", () => {
    expect(titleOf("a".repeat(100))).toBe(`${"a".repeat(TITLE_CHARACTERS)}…`);
  });
});
