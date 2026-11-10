import type { Queryable } from "../persistence/queryable.js";
import { sessionRowSchema } from "../persistence/session.schema.js";
import { Session } from "../persistence/session.js";
import {
  type TranscriptRow,
  transcriptRowSchema,
  type VersionMessage,
  versionMessageRowSchema,
  type VersionRow,
  versionRowSchema,
} from "./turn-run.schema.js";

// The SQL a run from a recorded turn sends (#245).

// Reads a recorded session from the live database. It writes nothing there.
export class RecordedSessionRepository {
  constructor(private readonly connection: Queryable) {}

  async session(agentSessionId: string): Promise<Session> {
    const { rows } = await this.connection.query(
      `SELECT id, trip_id, created_date_time, title, agent_session_id
       FROM sessions WHERE agent_session_id = $1`,
      [agentSessionId],
    );
    if (rows.length !== 1) {
      throw new Error(
        `There's no session with agent session ID ${agentSessionId}.`,
      );
    }
    return new Session(sessionRowSchema.parse(rows[0]));
  }

  async version(sessionId: string, turn: number): Promise<VersionRow> {
    const { rows } = await this.connection.query(
      `SELECT user_message, saved_date_time, plan, places, memory_items
       FROM trip_versions WHERE session_id = $1 AND turn = $2`,
      [sessionId, turn],
    );
    if (rows.length !== 1) {
      throw new Error(
        `The session has no trip version for turn ${String(turn)}.`,
      );
    }
    return versionRowSchema.parse(rows[0]);
  }

  // Each trip version's turn and message, in turn order.
  async versionMessages(sessionId: string): Promise<VersionMessage[]> {
    const { rows } = await this.connection.query(
      `SELECT turn, user_message FROM trip_versions
       WHERE session_id = $1 ORDER BY turn`,
      [sessionId],
    );
    return rows.map((row) => versionMessageRowSchema.parse(row));
  }

  // Every transcript line of the session, the coordinator's and the workers', in the
  // order stored.
  async transcriptRows(agentSessionId: string): Promise<TranscriptRow[]> {
    const { rows } = await this.connection.query(
      `SELECT id, worker_key, line FROM transcript_lines
       WHERE agent_session_id = $1 ORDER BY id`,
      [agentSessionId],
    );
    return rows.map((row) => transcriptRowSchema.parse(row));
  }
}

// Each row is one a version holds, turned into JSON with its column names. It's added
// to the run's trip, and a memory item to the run's user too. User memory has no trip.
const ADD_PLACE = `
  INSERT INTO places
  SELECT * FROM jsonb_populate_record(NULL::places,
    $1::jsonb || jsonb_build_object('trip_id', $2::text))`;

const ADD_MEMORY_ITEM = `
  INSERT INTO memory_items
  SELECT * FROM jsonb_populate_record(NULL::memory_items,
    $1::jsonb || jsonb_build_object(
      'user_id', $2::uuid,
      'trip_id', CASE WHEN $1::jsonb ->> 'trip_id' IS NULL THEN NULL ELSE $3::text END))`;

// Adds a run's trip to the local database. Its places and memory items keep their
// recorded IDs (persistence design, section 8.9).
export class RunTripRepository {
  constructor(private readonly connection: Queryable) {}

  async addTrip(
    trip: { id: string; ownerId: string },
    version: VersionRow,
  ): Promise<void> {
    await this.connection.query(
      "INSERT INTO trips (id, owner_id, plan) VALUES ($1, $2, $3::jsonb)",
      [trip.id, trip.ownerId, JSON.stringify(version.plan)],
    );
    for (const place of version.places) {
      await this.connection.query(ADD_PLACE, [JSON.stringify(place), trip.id]);
    }
    for (const item of version.memoryItems) {
      await this.connection.query(ADD_MEMORY_ITEM, [
        JSON.stringify(item),
        trip.ownerId,
        trip.id,
      ]);
    }
  }
}
