import { describe, expect, it } from "vitest";

import type { ChatEvent } from "../../src/shared/session.schema";
import {
  type ChatAction,
  chatReducer,
  type ChatState,
  EMPTY_CHAT,
  shownCards,
  shownConversation,
} from "./chat-state";

const SPAN_ID = "0123456789abcdef";

const TURN: ChatEvent[] = [
  { name: "traced", data: { spanId: SPAN_ID } },
  { name: "text", data: { text: "Let me save that." } },
  { name: "toolCall", data: { name: "mcp__trip__update_trip_brief" } },
  { name: "text", data: { text: "Five days it is." } },
  { name: "ended", data: { failure: null } },
];

function sentTurn(state: ChatState, events = TURN): ChatState {
  const actions: ChatAction[] = [
    { type: "sent", text: "Five days." },
    ...events.map((event): ChatAction => ({ type: "event", event })),
  ];
  return actions.reduce(chatReducer, state);
}

const LOADED_SESSION = {
  sessionId: "session_aaaaaaaa",
  agentSessionId: "4b9e2c1a-7d3f-4e8a-9b6c-5f1d2e3a4b7c",
  tripId: "trip_aaaaaaaa",
  messages: [
    { role: "user" as const, text: "Five days." },
    { role: "coordinator" as const, text: "Five days it is." },
    { role: "coordinator" as const, text: "Anything else?" },
  ],
  turnRunning: false,
};

// Each card, with the turn row under it, if any.
function rows(state: ChatState): string[] {
  return shownConversation(state).flatMap(({ card, turnRow }) => [
    `${card.kind}: ${card.text}`,
    ...(turnRow === null
      ? []
      : [`row: ${turnRow.spanId}${turnRow.failed ? " (failed)" : ""}`]),
  ]);
}

function shown(state: ChatState): string[] {
  return shownCards(state.cards).map((card) => `${card.kind}: ${card.text}`);
}

describe("the chat view's cards", () => {
  it("joins each reply's parts into one card", () => {
    const state = sentTurn(sentTurn(EMPTY_CHAT));
    const reply = "reply: Let me save that.\n\nFive days it is.";
    expect(shown(state)).toEqual([
      "user: Five days.",
      reply,
      "user: Five days.",
      reply,
    ]);
  });

  it("names the tool the coordinator is waiting on until the reply goes on", () => {
    const calling = sentTurn(EMPTY_CHAT, TURN.slice(0, 3));
    expect(calling.tool).toBe("update_trip_brief");
    expect(sentTurn(EMPTY_CHAT, TURN.slice(0, 4)).tool).toBeNull();
  });

  it("keeps a loaded session's messages apart", () => {
    const state = chatReducer(sentTurn(EMPTY_CHAT), {
      type: "loaded",
      session: LOADED_SESSION,
    });
    expect(shown(state)).toEqual([
      "user: Five days.",
      "reply: Five days it is.",
      "reply: Anything else?",
    ]);
  });
});

describe("the chat view's turn rows", () => {
  it("puts a row under each streamed turn's reply once it has ended", () => {
    const streaming = sentTurn(EMPTY_CHAT, TURN.slice(0, 2));
    expect(rows(streaming)).toEqual([
      "user: Five days.",
      "reply: Let me save that.",
    ]);
    expect(rows(sentTurn(EMPTY_CHAT))).toEqual([
      "user: Five days.",
      "reply: Let me save that.\n\nFive days it is.",
      `row: ${SPAN_ID}`,
    ]);
  });

  // The page's error line goes away on the next message, and the row stays.
  it("puts a failed turn's row under the user's message when there's no reply", () => {
    const failed = sentTurn(EMPTY_CHAT, [
      { name: "traced", data: { spanId: SPAN_ID } },
      { name: "ended", data: { failure: "error_during_execution" } },
    ]);
    expect(rows(failed)).toEqual([
      "user: Five days.",
      `row: ${SPAN_ID} (failed)`,
    ]);
  });

  // Loaded turns have no span ID.
  it("gives a loaded session's turns no rows, and keeps its agent session ID", () => {
    const state = chatReducer(sentTurn(EMPTY_CHAT), {
      type: "loaded",
      session: LOADED_SESSION,
    });
    expect(rows(state)).toEqual(shown(state));
    expect(state.agentSessionId).toBe(LOADED_SESSION.agentSessionId);
  });

  it("keeps a new session's agent session ID", () => {
    const state = chatReducer(EMPTY_CHAT, {
      type: "event",
      event: {
        name: "session",
        data: {
          tripId: "trip_aaaaaaaa",
          sessionId: "session_aaaaaaaa",
          agentSessionId: LOADED_SESSION.agentSessionId,
        },
      },
    });
    expect(state.agentSessionId).toBe(LOADED_SESSION.agentSessionId);
  });
});
