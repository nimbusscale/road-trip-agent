import type { Queryable } from "./queryable.js";
import { Session } from "./session.js";
import { sessionRowSchema } from "./session.schema.js";

// Reads and saves session rows (persistence design, section 8.7). Not named SessionStore,
// since that's the Agent SDK's name for the transcript adapter's interface.
export interface SessionRowStore {
  add(session: Session): Promise<void>;
  // The trip's sessions, in the order created.
  loadForTrip(tripId: string): Promise<Session[]>;
  // Undefined when there's no session with this ID.
  get(sessionId: string): Promise<Session | undefined>;
}

const COLUMNS = "id, trip_id, created_date_time, title, agent_session_id";

export class SessionRepository implements SessionRowStore {
  constructor(private readonly connection: Queryable) {}

  async add(session: Session): Promise<void> {
    await this.connection.query(
      `INSERT INTO sessions (${COLUMNS}) VALUES ($1, $2, $3, $4, $5)`,
      [
        session.id,
        session.tripId,
        session.createdDateTime,
        session.title,
        session.agentSessionId,
      ],
    );
  }

  async loadForTrip(tripId: string): Promise<Session[]> {
    // id breaks a tie between two sessions made in the same moment, so the order holds.
    const { rows } = await this.connection.query(
      `SELECT ${COLUMNS} FROM sessions WHERE trip_id = $1
       ORDER BY created_date_time, id`,
      [tripId],
    );
    return rows.map(toSession);
  }

  async get(sessionId: string): Promise<Session | undefined> {
    const { rows } = await this.connection.query(
      `SELECT ${COLUMNS} FROM sessions WHERE id = $1`,
      [sessionId],
    );
    return rows.length === 0 ? undefined : toSession(rows[0]);
  }
}

function toSession(row: unknown): Session {
  return new Session(sessionRowSchema.parse(row));
}
