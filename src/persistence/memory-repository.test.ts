import { describe, expect, it } from "vitest";

import { MemoryItem } from "./memory-item.js";
import { MemoryRepository } from "./memory-repository.js";
import type { Queryable } from "./queryable.js";

const USER_A = "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f";

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

const ITEM = new MemoryItem({
  id: "mem_k7m2x9qa",
  userId: USER_A,
  tripId: null,
  text: "we skip chains",
  createdDateTime: new Date("2026-10-15T12:00:00Z"),
});

// Turning a good row into an item is checked by hand against the local Postgres, since
// only a *.schema.ts file can name the snake_case columns.
describe("MemoryRepository", () => {
  it("returns undefined when there's no row", async () => {
    const repository = new MemoryRepository(new FakeConnection());
    expect(await repository.get(USER_A, ITEM.id)).toBeUndefined();
  });

  it("refuses a row that doesn't match the schema", async () => {
    const badRow = { id: ITEM.id, text: ITEM.text };
    const repository = new MemoryRepository(new FakeConnection([badRow]));
    await expect(repository.loadFor(USER_A, "trip_aaaaaaaa")).rejects.toThrow();
  });

  it("passes the user's ID to every query, as a parameter", async () => {
    const connection = new FakeConnection();
    const repository = new MemoryRepository(connection);
    await repository.add(ITEM);
    await repository.get(USER_A, ITEM.id);
    await repository.loadFor(USER_A, "trip_aaaaaaaa");
    await repository.save(ITEM);
    await repository.remove(USER_A, ITEM.id);
    const countConnection = new FakeConnection([{ count: 0 }]);
    await new MemoryRepository(countConnection).countFor(USER_A, null);
    for (const call of [...connection.calls, ...countConnection.calls]) {
      expect(call.values).toContain(USER_A);
      expect(call.text).not.toContain(USER_A);
    }
  });
});
