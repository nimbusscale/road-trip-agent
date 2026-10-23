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
      await stream.writeSSE(sseOf(chatEventOf(event)));
    }
  });
}

function sseOf(event: ChatEvent): { event: string; data: string } {
  return { event: event.name, data: JSON.stringify(event.data) };
}

// Every event goes to the browser. The raw view shows all but the text, and the cards
// are kept only in the tab (functional spec 10.1).
function chatEventOf(event: TurnEvent): ChatEvent {
  switch (event.kind) {
    case "started":
      return {
        name: "started",
        data: { model: event.model, tools: [...event.tools] },
      };
    case "message":
    case "thinking":
    case "text":
      return { name: event.kind, data: { text: event.text } };
    case "toolCall":
      return {
        name: "toolCall",
        data: { name: event.name, input: event.input },
      };
    case "toolReply":
      return {
        name: "toolReply",
        data: { text: event.text, isError: event.isError },
      };
    case "system":
      return {
        name: "system",
        data: { subtype: event.subtype, data: event.data },
      };
    case "ended":
      return {
        name: "ended",
        data: {
          failure: event.failure,
          durationMs: event.durationMs,
          usage: event.usage,
        },
      };
  }
}
