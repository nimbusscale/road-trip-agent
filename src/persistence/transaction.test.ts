import type { Pool, PoolClient } from "pg";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Connectable, Queryable } from "./queryable.js";
import { inTransaction } from "./transaction.js";

// Records each statement, and can fail one of them.
class FakeConnection {
  readonly statements: string[] = [];
  releasedWith: boolean | undefined = undefined;

  constructor(private readonly failingStatement?: string) {}

  connect(): Promise<this> {
    return Promise.resolve(this);
  }

  query(text: string): Promise<{ rows: readonly unknown[] }> {
    this.statements.push(text);
    if (text === this.failingStatement) {
      return Promise.reject(new Error("The connection failed."));
    }
    return Promise.resolve({ rows: [] });
  }

  release(destroy?: boolean): void {
    this.releasedWith = destroy ?? false;
  }
}

describe("inTransaction", () => {
  it("commits, and returns what the work returned", async () => {
    const connection = new FakeConnection();
    const result = await inTransaction(connection, async (client) => {
      await client.query("UPDATE trips");
      return "done";
    });
    expect(result).toBe("done");
    expect(connection.statements).toEqual(["BEGIN", "UPDATE trips", "COMMIT"]);
    expect(connection.releasedWith).toBe(false);
  });

  it("rolls back, and passes the error on, when the work throws", async () => {
    const connection = new FakeConnection();
    const work = (): Promise<never> => Promise.reject(new Error("Refused."));
    await expect(inTransaction(connection, work)).rejects.toThrow("Refused.");
    expect(connection.statements).toEqual(["BEGIN", "ROLLBACK"]);
    expect(connection.releasedWith).toBe(false);
  });

  it("drops the connection when the rollback fails too", async () => {
    const connection = new FakeConnection("ROLLBACK");
    const work = (): Promise<never> => Promise.reject(new Error("Refused."));
    await expect(inTransaction(connection, work)).rejects.toThrow("Refused.");
    expect(connection.releasedWith).toBe(true);
  });

  it("takes pg's pool, and gives the work pg's client", () => {
    expectTypeOf<Pool>().toExtend<Connectable>();
    expectTypeOf<PoolClient>().toExtend<Queryable>();
  });
});
