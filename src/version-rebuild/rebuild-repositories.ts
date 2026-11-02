import type { Queryable } from "../persistence/queryable.js";
import {
  countRowSchema,
  memoryRowSchema,
  placeRowSchema,
  sessionRowSchema,
  tripRowSchema,
  versionRowSchema,
} from "./rebuild-input.schema.js";

export type SessionRow = ReturnType<typeof sessionRowSchema.parse>;
export type TripRow = ReturnType<typeof tripRowSchema.parse>;
export type PlaceRow = ReturnType<typeof placeRowSchema.parse>;
export type MemoryRow = ReturnType<typeof memoryRowSchema.parse>;
export type VersionRow = ReturnType<typeof versionRowSchema.parse>;

// The SQL the trip versions rebuild sends (#244). Rows are read whole with to_jsonb(),
// and added whole with jsonb_populate_record(), so a copy needs no list of columns.

const MEMORY_FOR = `
  SELECT to_jsonb(item) AS row FROM memory_items item
  WHERE item.user_id = $1 AND (item.trip_id IS NULL OR item.trip_id = $2)
  ORDER BY item.created_date_time, item.id`;

// Reads a trip's rows, from either database.
class TripRowReader {
  constructor(protected readonly connection: Queryable) {}

  async trip(tripId: string): Promise<TripRow> {
    const { rows } = await this.connection.query(
      "SELECT to_jsonb(trip) AS row FROM trips trip WHERE id = $1",
      [tripId],
    );
    return tripRowSchema.parse(rows[0]);
  }

  async places(tripId: string): Promise<PlaceRow[]> {
    const { rows } = await this.connection.query(
      "SELECT to_jsonb(place) AS row FROM places place WHERE trip_id = $1 ORDER BY id",
      [tripId],
    );
    return rows.map((row) => placeRowSchema.parse(row));
  }

  // The memory the coordinator reads, in the order MemoryReader.read() gives it.
  async memory(userId: string, tripId: string): Promise<MemoryRow[]> {
    const { rows } = await this.connection.query(MEMORY_FOR, [userId, tripId]);
    return rows.map((row) => memoryRowSchema.parse(row));
  }

  async versions(sessionId: string): Promise<VersionRow[]> {
    const { rows } = await this.connection.query(
      "SELECT to_jsonb(version) AS row FROM trip_versions version WHERE session_id = $1 ORDER BY turn",
      [sessionId],
    );
    return rows.map((row) => versionRowSchema.parse(row));
  }
}

// Reads one session from the live database, and adds its trip versions: the only write
// the rebuild makes there.
export class LiveSessionRepository extends TripRowReader {
  async session(agentSessionId: string): Promise<SessionRow> {
    const { rows } = await this.connection.query(
      "SELECT to_jsonb(session) AS row FROM sessions session WHERE agent_session_id = $1",
      [agentSessionId],
    );
    if (rows.length !== 1) {
      throw new Error(
        `There's no session with agent session ID ${agentSessionId}.`,
      );
    }
    return sessionRowSchema.parse(rows[0]);
  }

  async sessionCount(tripId: string): Promise<number> {
    const { rows } = await this.connection.query(
      "SELECT count(*) AS count FROM sessions WHERE trip_id = $1",
      [tripId],
    );
    return countRowSchema.parse(rows[0]);
  }

  // A version already there for the turn is replaced, so the rebuild can run again.
  async addVersions(versions: readonly VersionRow[]): Promise<void> {
    for (const { whole } of versions) {
      await this.connection.query(
        `INSERT INTO trip_versions
         SELECT * FROM jsonb_populate_record(NULL::trip_versions, $1::jsonb)
         ON CONFLICT (session_id, turn) DO UPDATE SET
           user_message = excluded.user_message,
           saved_date_time = excluded.saved_date_time,
           plan = excluded.plan,
           places = excluded.places,
           memory_items = excluded.memory_items`,
        [JSON.stringify(whole)],
      );
    }
  }
}

// What the rebuild does in the local database, besides what today's code does.
export class LocalRebuildRepository extends TripRowReader {
  async hasTrip(tripId: string): Promise<boolean> {
    const { rows } = await this.connection.query(
      "SELECT count(*) AS count FROM trips WHERE id = $1",
      [tripId],
    );
    return countRowSchema.parse(rows[0]) > 0;
  }

  // An earlier run's user memory items. Trip memory goes with the trip.
  async removeMemoryItems(ids: readonly string[]): Promise<void> {
    await this.connection.query("DELETE FROM memory_items WHERE id = ANY($1)", [
      ids,
    ]);
  }

  async userMemoryCount(userId: string): Promise<number> {
    const { rows } = await this.connection.query(
      "SELECT count(*) AS count FROM memory_items WHERE user_id = $1 AND trip_id IS NULL",
      [userId],
    );
    return countRowSchema.parse(rows[0]);
  }

  async addRow(
    table: "sessions" | "places" | "memory_items",
    whole: unknown,
  ): Promise<void> {
    await this.connection.query(
      `INSERT INTO ${table}
       SELECT * FROM jsonb_populate_record(NULL::${table}, $1::jsonb)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(whole)],
    );
  }

  async hasPlace(placeId: string): Promise<boolean> {
    const { rows } = await this.connection.query(
      "SELECT count(*) AS count FROM places WHERE id = $1",
      [placeId],
    );
    return countRowSchema.parse(rows[0]) > 0;
  }

  // Drops one check's results from the trip's saved list, keeping the order of the rest.
  async dropCheckResults(tripId: string, check: string): Promise<void> {
    await this.connection.query(
      `UPDATE trips SET plan = jsonb_set(plan, '{itinerary,checkResults}', (
         SELECT coalesce(jsonb_agg(result ORDER BY position), '[]'::jsonb)
         FROM jsonb_array_elements(plan -> 'itinerary' -> 'checkResults')
           WITH ORDINALITY AS results (result, position)
         WHERE result ->> 'check' <> $2))
       WHERE id = $1`,
      [tripId, check],
    );
  }

  // Today's code saves a memory item with the time it runs. The live row's time keeps
  // the items in the order the coordinator read them.
  async setMemoryCreated(itemId: string, at: Date): Promise<void> {
    await this.connection.query(
      "UPDATE memory_items SET created_date_time = $2 WHERE id = $1",
      [itemId, at],
    );
  }
}
