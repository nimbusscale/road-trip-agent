import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import type { TurnEvent } from "../agent/turn-event.js";
import type { Turn } from "../agent/turn.js";
import type { ChatEvent } from "../shared/session.schema.js";

// Streams a turn's events to the browser with Server-Sent Events (systems design
// section 4). When the browser goes away, the stream stops, and the turn goes on: its
// transcript is saved as it goes, so a resume shows the finished reply.
export function streamTurn(
  context: Context,
  turn: Turn,
  opening?: ChatEvent,
): Response {
  return streamSSE(context, async (stream) => {
    if (opening !== undefined) {
      await stream.writeSSE(sseOf(opening));
    }
    for await (const event of turn.events()) {
      if (stream.aborted) {
        return;
      }
      const chatEvent = chatEventOf(event);
      if (chatEvent !== null) {
        await stream.writeSSE(sseOf(chatEvent));
      }
    }
  });
}

function sseOf(event: ChatEvent): { event: string; data: string } {
  return { event: event.name, data: JSON.stringify(event.data) };
}

// The browser shows the reply, and which tool is running. Tool inputs and replies are
// only in the terminal chat.
function chatEventOf(event: TurnEvent): ChatEvent | null {
  switch (event.kind) {
    case "text":
      return { name: "text", data: { text: event.text } };
    case "toolCall":
      return { name: "tool", data: { name: shortToolName(event.name) } };
    case "ended":
      return { name: "ended", data: { succeeded: event.failure === null } };
    default:
      return null;
  }
}

// Such as update_trip_brief, from mcp__trip__update_trip_brief.
function shortToolName(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}
