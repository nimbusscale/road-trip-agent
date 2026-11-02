import type { Queryable } from "./queryable.js";

// Which turn a version is for, and what it copies (persistence design, section 8.9).
export interface TripVersionSource {
  sessionId: string;
  // The session's user messages so far, counting this turn's, the way the browser shows
  // them.
  turn: number;
  savedDateTime: Date;
  tripId: string;
  // The user whose memory the coordinator reads: the trip's owner.
  userId: string;
}

// Saves trip version rows (persistence design, section 8.7).
export interface TripVersionStore {
  // Copies the trip's plan, its places, and the memory the coordinator reads. A version
  // already saved for the turn is replaced.
  saveFrom(source: TripVersionSource): Promise<void>;
}

// One statement, so its reads all see the same moment, with no lock. The memory is what
// MemoryReader.read() returns, in the same order. A turn that failed before its message
// reached the transcript leaves the next turn with the same number, and that turn's
// version is the one an evaluation needs.
const SAVE_VERSION = `
  INSERT INTO trip_versions
    (session_id, turn, saved_date_time, plan, places, memory_items)
  SELECT $1, $2, $3, trips.plan,
    (SELECT coalesce(jsonb_agg(to_jsonb(place) ORDER BY place.id), '[]'::jsonb)
       FROM places place WHERE place.trip_id = trips.id),
    (SELECT coalesce(
        jsonb_agg(to_jsonb(item) ORDER BY item.created_date_time, item.id), '[]'::jsonb)
       FROM memory_items item
       WHERE item.user_id = $5 AND (item.trip_id IS NULL OR item.trip_id = trips.id))
  FROM trips WHERE trips.id = $4
  ON CONFLICT (session_id, turn) DO UPDATE SET
    saved_date_time = excluded.saved_date_time,
    plan = excluded.plan,
    places = excluded.places,
    memory_items = excluded.memory_items`;

export class TripVersionRepository implements TripVersionStore {
  constructor(private readonly connection: Queryable) {}

  async saveFrom(source: TripVersionSource): Promise<void> {
    const { sessionId, turn, savedDateTime, tripId, userId } = source;
    await this.connection.query(SAVE_VERSION, [
      sessionId,
      turn,
      savedDateTime,
      tripId,
      userId,
    ]);
  }
}
