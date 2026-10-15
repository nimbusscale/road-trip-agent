import { MemoryItem } from "./memory-item.js";
import {
  memoryCountRowSchema,
  memoryItemRowSchema,
} from "./memory-item.schema.js";
import type { Queryable } from "./queryable.js";

// Reads and saves memory item rows (persistence design, section 8.7). Every query names
// the user, so a slip elsewhere can't reach another user's items (section 8.8).
export interface MemoryStore {
  add(item: MemoryItem): Promise<void>;
  // The user's memory and this trip's memory, in the order created.
  loadFor(userId: string, tripId: string): Promise<MemoryItem[]>;
  // How many items user memory holds, when tripId is null, or this trip's memory.
  countFor(userId: string, tripId: string | null): Promise<number>;
  // Undefined when the user has no item with this ID.
  get(userId: string, itemId: string): Promise<MemoryItem | undefined>;
  // Saves the item's new text.
  save(item: MemoryItem): Promise<void>;
  remove(userId: string, itemId: string): Promise<void>;
}

const COLUMNS = "id, user_id, trip_id, text, created_date_time";

export class MemoryRepository implements MemoryStore {
  constructor(private readonly connection: Queryable) {}

  async add(item: MemoryItem): Promise<void> {
    await this.connection.query(
      `INSERT INTO memory_items (${COLUMNS}) VALUES ($1, $2, $3, $4, $5)`,
      [item.id, item.userId, item.tripId, item.text, item.createdDateTime],
    );
  }

  async loadFor(userId: string, tripId: string): Promise<MemoryItem[]> {
    // id breaks a tie between two items made in the same moment, so the order holds.
    const { rows } = await this.connection.query(
      `SELECT ${COLUMNS} FROM memory_items
       WHERE user_id = $1 AND (trip_id IS NULL OR trip_id = $2)
       ORDER BY created_date_time, id`,
      [userId, tripId],
    );
    return rows.map(toMemoryItem);
  }

  async countFor(userId: string, tripId: string | null): Promise<number> {
    const { rows } = await this.connection.query(
      `SELECT count(*)::int AS count FROM memory_items
       WHERE user_id = $1 AND trip_id IS NOT DISTINCT FROM $2`,
      [userId, tripId],
    );
    return memoryCountRowSchema.parse(rows[0]);
  }

  async get(userId: string, itemId: string): Promise<MemoryItem | undefined> {
    const { rows } = await this.connection.query(
      `SELECT ${COLUMNS} FROM memory_items WHERE id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    return rows.length === 0 ? undefined : toMemoryItem(rows[0]);
  }

  async save(item: MemoryItem): Promise<void> {
    await this.connection.query(
      "UPDATE memory_items SET text = $1 WHERE id = $2 AND user_id = $3",
      [item.text, item.id, item.userId],
    );
  }

  async remove(userId: string, itemId: string): Promise<void> {
    await this.connection.query(
      "DELETE FROM memory_items WHERE id = $1 AND user_id = $2",
      [itemId, userId],
    );
  }
}

function toMemoryItem(row: unknown): MemoryItem {
  return new MemoryItem(memoryItemRowSchema.parse(row));
}
