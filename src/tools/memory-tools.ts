import type { MemoryItem } from "../persistence/memory-item.js";
import { refuseWrongKind } from "./id-kind.js";
import {
  addMemoryItemInput,
  FORGET_MEMORY_ITEM_INPUT,
  type Memory,
  READ_MEMORY_INPUT,
  updateMemoryItemInput,
} from "./memory-input.schema.js";
import type { MemorySession } from "./memory-session.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { textReply, writeReplyOrReadableError } from "./tool-reply.js";

// The memory tools (tool design, section 2.2). Coordinator only.

export const READ_MEMORY_DESCRIPTION =
  "Reads all of user memory and all of this trip's memory. Returns how many items each holds, and the most it can hold. Then every item, in the order added, with its ID, whether it's user or trip memory, and its text.";

export function addMemoryItemDescription(maximumItems: number): string {
  return `Adds an item to user memory or to this trip's memory. Each holds at most ${String(maximumItems)} items. The reply gives the new item's ID.`;
}

export const UPDATE_MEMORY_ITEM_DESCRIPTION =
  "Replaces a memory item's text. The item keeps its ID, and stays in the same memory.";

export const FORGET_MEMORY_ITEM_DESCRIPTION = "Removes a memory item for good.";

const MEMORY_NAMES: Record<Memory, string> = {
  user: "user memory",
  trip: "this trip's memory",
};

export function readMemoryTool(session: MemorySession): StrictToolDefinition {
  return {
    ...strictTool(
      "read_memory",
      READ_MEMORY_DESCRIPTION,
      READ_MEMORY_INPUT,
      async () => {
        const items = await session.reader.read(session.userId, session.tripId);
        return textReply(memoryLines(items, session.limits.maximumMemoryItems));
      },
    ),
    annotations: { readOnlyHint: true },
  };
}

export function addMemoryItemTool(
  session: MemorySession,
): StrictToolDefinition {
  const { maximumMemoryItems, maximumMemoryItemCharacters } = session.limits;
  return strictTool(
    "add_memory_item",
    addMemoryItemDescription(maximumMemoryItems),
    addMemoryItemInput(maximumMemoryItemCharacters),
    ({ memory, text }) =>
      writeReplyOrReadableError(async () => {
        const tripId = memory === "trip" ? session.tripId : null;
        const item = await session.writer.add(session.userId, tripId, text);
        return textReply([`Added ${item.id} to ${MEMORY_NAMES[memory]}.`]);
      }),
  );
}

export function updateMemoryItemTool(
  session: MemorySession,
): StrictToolDefinition {
  return strictTool(
    "update_memory_item",
    UPDATE_MEMORY_ITEM_DESCRIPTION,
    updateMemoryItemInput(session.limits.maximumMemoryItemCharacters),
    ({ itemId, text }) =>
      writeReplyOrReadableError(async () => {
        refuseWrongKind(itemId, "memoryItem");
        await session.writer.update(
          session.userId,
          session.tripId,
          itemId,
          text,
        );
        return textReply([`Changed ${itemId}.`]);
      }),
  );
}

export function forgetMemoryItemTool(
  session: MemorySession,
): StrictToolDefinition {
  return strictTool(
    "forget_memory_item",
    FORGET_MEMORY_ITEM_DESCRIPTION,
    FORGET_MEMORY_ITEM_INPUT,
    ({ itemId }) =>
      writeReplyOrReadableError(async () => {
        refuseWrongKind(itemId, "memoryItem");
        await session.writer.forget(session.userId, session.tripId, itemId);
        return textReply([`Forgot ${itemId}.`]);
      }),
  );
}

// The counts first, so the coordinator sees when memory is nearly full without
// counting the lines itself.
function memoryLines(
  items: readonly MemoryItem[],
  maximumItems: number,
): string[] {
  const userCount = items.filter((item) => item.tripId === null).length;
  const tripCount = items.length - userCount;
  const maximum = String(maximumItems);
  return [
    `User memory: ${String(userCount)} of ${maximum} items.`,
    `This trip's memory: ${String(tripCount)} of ${maximum} items.`,
    ...items.map(
      (item) =>
        `- ${item.id} (${item.tripId === null ? "user" : "trip"}): ${item.text}`,
    ),
  ];
}
