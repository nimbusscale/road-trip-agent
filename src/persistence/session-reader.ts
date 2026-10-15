import type { Queryable } from "./queryable.js";
import type { SessionRowStore } from "./session-repository.js";
import type { Session } from "./session.js";

export interface SessionReaderOptions {
  pool: Queryable;
  makeStore: (connection: Queryable) => SessionRowStore;
}

// Reads sessions (persistence design, section 8.5).
export class SessionReader {
  constructor(private readonly options: SessionReaderOptions) {}

  // The trip's sessions, in the order created, for the trip's session list.
  listForTrip(tripId: string): Promise<Session[]> {
    return this.options.makeStore(this.options.pool).loadForTrip(tripId);
  }

  // Undefined when there's no session with this ID. To resume it, the app hands its
  // agentSessionId and a TranscriptAdapter to the SDK.
  get(sessionId: string): Promise<Session | undefined> {
    return this.options.makeStore(this.options.pool).get(sessionId);
  }
}
