import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import type { Settings } from "../config/settings.schema.js";
import { MemoryReader } from "../persistence/memory-reader.js";
import { MemoryRepository } from "../persistence/memory-repository.js";
import { MemoryWriter } from "../persistence/memory-writer.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import { tripStartedCheckUsing } from "../persistence/trip-started-check.js";
import { TripRepository } from "../persistence/trip-repository.js";
import {
  addMemoryItemTool,
  forgetMemoryItemTool,
  readMemoryTool,
  updateMemoryItemTool,
} from "./memory-tools.js";
import type { MemorySession } from "./memory-session.js";
import type { StrictToolDefinition } from "./strict-tool.js";

// Part of every tool name the model sees, such as mcp__memory__read_memory (tool
// design, section 1).
export const MEMORY_SERVER_NAME = "memory";

export interface MemoryAccessGiven {
  pool: Connectable & Queryable;
  settings: Settings;
  // The current moment, for the started-trip check.
  now: () => Date;
}

// The app's writer and reader for memory, made once when it starts and shared by every
// session's memory server.
export function memoryAccessFor(
  given: MemoryAccessGiven,
): Omit<MemorySession, "userId" | "tripId"> {
  const { pool, settings, now } = given;
  const makeStore = (connection: Queryable): MemoryRepository =>
    new MemoryRepository(connection);
  return {
    writer: new MemoryWriter({
      pool,
      makeStore,
      hasTripStarted: tripStartedCheckUsing(
        (connection) => new TripRepository(connection),
        now,
      ),
      limits: settings,
    }),
    reader: new MemoryReader({ pool, makeStore }),
    limits: settings,
  };
}

// Made for each session, with its user and trip already set. One server object can't
// be shared by two sessions running at once (tool design, section 4).
export function createMemoryServer(
  session: MemorySession,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: MEMORY_SERVER_NAME,
    // The coordinator reads memory at the start of every session, so it's never left
    // for it to find with a tool search.
    alwaysLoad: true,
    tools: memoryTools(session),
  });
}

// The memory server's tools. The trip versions rebuild calls them directly too (#244).
export function memoryTools(session: MemorySession): StrictToolDefinition[] {
  return [
    readMemoryTool(session),
    addMemoryItemTool(session),
    updateMemoryItemTool(session),
    forgetMemoryItemTool(session),
  ];
}
