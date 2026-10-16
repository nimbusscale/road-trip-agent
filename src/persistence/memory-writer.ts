import type { Settings } from "../config/settings.schema.js";
import type { CalendarDate } from "../domain/calendar-date.js";
import { RuleError } from "../domain/rule-error.js";
import { newId } from "../ids/new-id.js";
import { MemoryItem } from "./memory-item.js";
import type { MemoryStore } from "./memory-repository.js";
import type { Connectable, Queryable } from "./queryable.js";
import { inTransaction } from "./transaction.js";

// Says whether the trip has started, on the writer's connection: today's date at its
// start place once it has, for the error, or null while it hasn't. Phase 12a passes one
// that loads the trip with TripRepository.load(), without the row lock (persistence
// design, section 8.8).
export type TripStartedCheck = (
  connection: Queryable,
  tripId: string,
) => Promise<CalendarDate | null>;

export type MemoryLimits = Pick<
  Settings,
  "maximumMemoryItems" | "maximumMemoryItemCharacters"
>;

export interface MemoryWriterOptions {
  pool: Connectable;
  makeStore: (connection: Queryable) => MemoryStore;
  hasTripStarted: TripStartedCheck;
  limits: MemoryLimits;
}

// The same error for an ID that doesn't exist and for another user's or another trip's
// item, so it doesn't say whether someone else's item exists (persistence design, 8.8).
export const NO_SUCH_MEMORY_ITEM = "No such memory item.";

// Changes memory (persistence design, section 8.8). The tools pass the session's user
// and trip, so no agent chooses them. Nothing here takes the trip's row lock or loads
// the plan for a write, since memory isn't part of the plan (section 2).
export class MemoryWriter {
  constructor(private readonly options: MemoryWriterOptions) {}

  // tripId is the session's trip for a trip memory item, and null for a user memory item.
  async add(
    userId: string,
    tripId: string | null,
    text: string,
  ): Promise<MemoryItem> {
    this.#refuseTooLong(text);
    return inTransaction(this.options.pool, async (client) => {
      const store = this.options.makeStore(client);
      await this.#refuseIfFull(store, userId, tripId);
      const item = new MemoryItem({
        id: newId("memoryItem"),
        userId,
        tripId,
        text,
        createdDateTime: new Date(),
      });
      await this.#refuseIfTripStarted(client, item);
      await store.add(item);
      return item;
    });
  }

  async update(
    userId: string,
    tripId: string,
    itemId: string,
    text: string,
  ): Promise<MemoryItem> {
    this.#refuseTooLong(text);
    return inTransaction(this.options.pool, async (client) => {
      const store = this.options.makeStore(client);
      const item = await getOwnItem(store, userId, tripId, itemId);
      item.text = text;
      await this.#refuseIfTripStarted(client, item);
      await store.save(item);
      return item;
    });
  }

  // Removes the row. A forgotten item is gone, not hidden (functional spec 10.5).
  async forget(userId: string, tripId: string, itemId: string): Promise<void> {
    return inTransaction(this.options.pool, async (client) => {
      const store = this.options.makeStore(client);
      const item = await getOwnItem(store, userId, tripId, itemId);
      await this.#refuseIfTripStarted(client, item);
      await store.remove(userId, item.id);
    });
  }

  #refuseTooLong(text: string): void {
    const maximum = this.options.limits.maximumMemoryItemCharacters;
    const length = text.length;
    if (length > maximum) {
      throw new RuleError(
        `A memory item is at most ${String(maximum)} characters. This one is ${String(length)}.`,
      );
    }
  }

  async #refuseIfFull(
    store: MemoryStore,
    userId: string,
    tripId: string | null,
  ): Promise<void> {
    const maximum = this.options.limits.maximumMemoryItems;
    if ((await store.countFor(userId, tripId)) < maximum) {
      return;
    }
    const memory = tripId === null ? "User memory" : "This trip's memory";
    throw new RuleError(
      `${memory} already holds ${String(maximum)} items, the most it can. Merge or forget items first.`,
    );
  }

  // User items can change on any day. A started trip's memory can't (technical spec 3.1).
  async #refuseIfTripStarted(
    connection: Queryable,
    item: MemoryItem,
  ): Promise<void> {
    if (item.tripId === null) {
      return;
    }
    const today = await this.options.hasTripStarted(connection, item.tripId);
    if (today !== null) {
      throw new RuleError(
        `This trip has started, so its memory can't change. Today is ${today.longText} at its start place, on or after its start date. User memory still can.`,
      );
    }
  }
}

// The user's item, if it's a user item or this trip's item.
async function getOwnItem(
  store: MemoryStore,
  userId: string,
  tripId: string,
  itemId: string,
): Promise<MemoryItem> {
  const item = await store.get(userId, itemId);
  if (item === undefined || (item.tripId !== null && item.tripId !== tripId)) {
    throw new RuleError(NO_SUCH_MEMORY_ITEM);
  }
  return item;
}
