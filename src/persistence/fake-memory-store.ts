import { MemoryItem, type MemoryItemProperties } from "./memory-item.js";
import type { MemoryStore } from "./memory-repository.js";
import type { Connectable, Queryable, TransactionClient } from "./queryable.js";

// Keeps memory item rows in memory, in place of Postgres (DEVELOPMENT.md section 5). It
// filters the way MemoryRepository's queries do. Each read returns a new MemoryItem, so
// a change shows up only once it's saved, as with the database.
export class FakeMemoryStore implements MemoryStore {
  readonly rows: MemoryItemProperties[] = [];

  add(item: MemoryItem): Promise<void> {
    this.rows.push(propertiesOf(item));
    return Promise.resolve();
  }

  loadFor(userId: string, tripId: string): Promise<MemoryItem[]> {
    const items = this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          (row.tripId === null || row.tripId === tripId),
      )
      .sort(
        (first, second) =>
          first.createdDateTime.getTime() - second.createdDateTime.getTime(),
      )
      .map((row) => new MemoryItem(row));
    return Promise.resolve(items);
  }

  countFor(userId: string, tripId: string | null): Promise<number> {
    const count = this.rows.filter(
      (row) => row.userId === userId && row.tripId === tripId,
    ).length;
    return Promise.resolve(count);
  }

  get(userId: string, itemId: string): Promise<MemoryItem | undefined> {
    const row = this.#find(userId, itemId);
    return Promise.resolve(row === undefined ? undefined : new MemoryItem(row));
  }

  save(item: MemoryItem): Promise<void> {
    const row = this.#find(item.userId, item.id);
    if (row !== undefined) {
      row.text = item.text;
    }
    return Promise.resolve();
  }

  remove(userId: string, itemId: string): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.userId === userId && row.id === itemId,
    );
    if (index !== -1) {
      this.rows.splice(index, 1);
    }
    return Promise.resolve();
  }

  #find(userId: string, itemId: string): MemoryItemProperties | undefined {
    return this.rows.find((row) => row.userId === userId && row.id === itemId);
  }
}

function propertiesOf(item: MemoryItem): MemoryItemProperties {
  return {
    id: item.id,
    userId: item.userId,
    tripId: item.tripId,
    text: item.text,
    createdDateTime: item.createdDateTime,
  };
}

// A pool whose connections do nothing. The writer's and reader's SQL goes through the
// fake store instead.
const doNothing = (): Promise<{ rows: readonly unknown[] }> =>
  Promise.resolve({ rows: [] });

export const FAKE_POOL: Connectable & Queryable = {
  query: doNothing,
  connect: (): Promise<TransactionClient> =>
    Promise.resolve({ query: doNothing, release: () => undefined }),
};
