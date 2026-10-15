import type { MemoryItem } from "./memory-item.js";
import type { MemoryStore } from "./memory-repository.js";
import type { Queryable } from "./queryable.js";

export interface MemoryReaderOptions {
  pool: Queryable;
  makeStore: (connection: Queryable) => MemoryStore;
}

// Reads memory (persistence design, section 8.8). The tool read_memory uses it.
export class MemoryReader {
  constructor(private readonly options: MemoryReaderOptions) {}

  // All of the user's memory and all of this trip's memory, in the order created.
  read(userId: string, tripId: string): Promise<MemoryItem[]> {
    return this.options.makeStore(this.options.pool).loadFor(userId, tripId);
  }
}
