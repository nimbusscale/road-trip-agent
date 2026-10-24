import { Hono } from "hono";

import type { MemoryItem } from "../persistence/memory-item.js";
import type {
  MemoryResponse,
  ShownMemoryItem,
} from "../shared/memory.schema.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { openableSession } from "./owned.js";

// The chat view's memory list, and forgetting an item from it (functional spec 10.5).
// These are the user's own calls, not the coordinator's tools. Each goes by the
// session, like the memory tools, so it reaches only the session user's memory and this
// trip's.
export function memoryRoutes(chat: ChatDependencies): Hono {
  const routes = new Hono();

  routes.get("/sessions/:sessionId/memory", async (context) => {
    const user = context.get("user");
    const { session } = await openableSession(
      chat,
      context.req.param("sessionId"),
      user,
    );
    const items = await chat.memory.reader.read(user.userId, session.tripId);
    const body: MemoryResponse = {
      userMemory: items.filter((item) => item.tripId === null).map(shownOf),
      tripMemory: items.filter((item) => item.tripId !== null).map(shownOf),
    };
    return context.json(body);
  });

  // The coordinator may have read the item earlier in the conversation, so its next
  // message tells it to read memory again (technical spec 5.2).
  routes.delete("/sessions/:sessionId/memory/:itemId", async (context) => {
    const user = context.get("user");
    const { session } = await openableSession(
      chat,
      context.req.param("sessionId"),
      user,
    );
    await chat.memory.writer.forget(
      user.userId,
      session.tripId,
      context.req.param("itemId"),
    );
    chat.turns.markMemoryForgotten(session.id);
    return context.body(null, 204);
  });

  return routes;
}

function shownOf(item: MemoryItem): ShownMemoryItem {
  return { id: item.id, text: item.text };
}
