import { describe, expect, it } from "vitest";

import type { Queryable } from "./queryable.js";
import { SessionRepository } from "./session-repository.js";
import { Session } from "./session.js";
import { TranscriptRepository } from "./transcript-repository.js";

const AGENT_SESSION_ID = "8ab57545-dd4c-4e3c-8094-34b27ec7249a";

// Records each query, and returns the rows it's given. The SQL itself is checked by hand
// against the local Postgres (DEVELOPMENT.md section 5).
class FakeConnection implements Queryable {
  readonly calls: { text: string; values: readonly unknown[] }[] = [];

  constructor(private readonly rows: readonly unknown[] = []) {}

  query(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: readonly unknown[] }> {
    this.calls.push({ text, values });
    return Promise.resolve({ rows: this.rows });
  }
}

const SESSION = new Session({
  id: "session_k7m2x9qa",
  tripId: "trip_k7m2x9qa",
  createdDateTime: new Date("2026-10-15T12:00:00Z"),
  title: "Plan a trip to Moab",
  agentSessionId: AGENT_SESSION_ID,
});

// Turning a good row into a session is checked by hand against the local Postgres, since
// only a *.schema.ts file can name the snake_case columns.
describe("SessionRepository", () => {
  it("returns undefined when there's no row", async () => {
    const repository = new SessionRepository(new FakeConnection());
    expect(await repository.get(SESSION.id)).toBeUndefined();
  });

  it("refuses a row that doesn't match the schema", async () => {
    const badRow = { id: SESSION.id, title: SESSION.title };
    const repository = new SessionRepository(new FakeConnection([badRow]));
    await expect(repository.loadForTrip(SESSION.tripId)).rejects.toThrow();
  });

  it("passes each value as a parameter", async () => {
    const connection = new FakeConnection();
    await new SessionRepository(connection).add(SESSION);
    expect(connection.calls[0]?.values).toContain(SESSION.title);
    expect(connection.calls[0]?.text).not.toContain(SESSION.title);
  });
});

describe("TranscriptRepository", () => {
  const key = { agentSessionId: AGENT_SESSION_ID, workerKey: "" };

  it("adds a batch of lines in one statement, in order, as parameters", async () => {
    const connection = new FakeConnection();
    const lines = [
      { type: "user", uuid: "u1", message: "it's a test" },
      { type: "ai-title", title: "No uuid" },
    ];
    await new TranscriptRepository(connection).addLines(key, lines);
    expect(connection.calls).toHaveLength(1);
    expect(connection.calls[0]?.values).toEqual([
      AGENT_SESSION_ID,
      "",
      "u1",
      JSON.stringify(lines[0]),
      AGENT_SESSION_ID,
      "",
      null,
      JSON.stringify(lines[1]),
    ]);
    expect(connection.calls[0]?.text).not.toContain("it's a test");
  });

  it("sends nothing for an empty batch", async () => {
    const connection = new FakeConnection();
    await new TranscriptRepository(connection).addLines(key, []);
    expect(connection.calls).toEqual([]);
  });

  it("refuses a stored line with no type", async () => {
    const badRow = { line: { uuid: "u1" } };
    const repository = new TranscriptRepository(new FakeConnection([badRow]));
    await expect(repository.loadLines(key)).rejects.toThrow();
  });
});
