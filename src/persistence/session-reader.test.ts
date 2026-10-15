import { describe, expect, it } from "vitest";

import { FakeSessionRowStore } from "./fake-session-row-store.js";
import type { Queryable } from "./queryable.js";
import { SessionReader } from "./session-reader.js";
import { Session } from "./session.js";

const POOL: Queryable = {
  query: () => Promise.resolve({ rows: [] }),
};

function sessionOf(id: string, tripId: string, created: string): Session {
  return new Session({
    id,
    tripId,
    createdDateTime: new Date(created),
    title: "Plan a trip",
    agentSessionId: "8ab57545-dd4c-4e3c-8094-34b27ec7249a",
  });
}

describe("SessionReader", () => {
  it("lists only the trip's sessions, in the order created", async () => {
    const store = new FakeSessionRowStore();
    const later = sessionOf("session_bbbbbbbb", "trip_aaaaaaaa", "2026-10-16");
    const earlier = sessionOf(
      "session_cccccccc",
      "trip_aaaaaaaa",
      "2026-10-15",
    );
    const other = sessionOf("session_dddddddd", "trip_zzzzzzzz", "2026-10-14");
    for (const session of [later, earlier, other]) {
      await store.add(session);
    }
    const reader = new SessionReader({ pool: POOL, makeStore: () => store });
    expect(await reader.listForTrip("trip_aaaaaaaa")).toEqual([earlier, later]);
    expect(await reader.get(other.id)).toBe(other);
    expect(await reader.get("session_xxxxxxxx")).toBeUndefined();
  });
});
