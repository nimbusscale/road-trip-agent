import type { MemoryReader } from "../persistence/memory-reader.js";
import type {
  MemoryLimits,
  MemoryWriter,
} from "../persistence/memory-writer.js";

// What the memory tools of one session are given. The user and trip come from the
// session, never from a tool input, so no agent can reach another user's memory, even
// with a made-up ID (tool design, section 4).
export interface MemorySession {
  readonly userId: string;
  readonly tripId: string;
  readonly writer: MemoryWriter;
  readonly reader: MemoryReader;
  // For the limits the tools' descriptions give, and the counts read_memory gives.
  readonly limits: MemoryLimits;
}
