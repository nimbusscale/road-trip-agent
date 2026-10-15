import type { SessionRowStore } from "./session-repository.js";
import type { Session } from "./session.js";

// Keeps session rows in memory, in place of Postgres (DEVELOPMENT.md section 5). A
// session never changes, so it can keep the objects themselves.
export class FakeSessionRowStore implements SessionRowStore {
  readonly rows: Session[] = [];

  add(session: Session): Promise<void> {
    this.rows.push(session);
    return Promise.resolve();
  }

  loadForTrip(tripId: string): Promise<Session[]> {
    const sessions = this.rows
      .filter((session) => session.tripId === tripId)
      .sort(
        (first, second) =>
          first.createdDateTime.getTime() - second.createdDateTime.getTime(),
      );
    return Promise.resolve(sessions);
  }

  get(sessionId: string): Promise<Session | undefined> {
    return Promise.resolve(
      this.rows.find((session) => session.id === sessionId),
    );
  }
}
