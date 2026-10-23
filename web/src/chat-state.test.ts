import { describe, expect, it } from "vitest";

import type { ChatEvent } from "../../src/shared/session.schema";
import {
  type ChatAction,
  chatReducer,
  type ChatState,
  EMPTY_CHAT,
  shownCards,
} from "./chat-state";

const TURN: ChatEvent[] = [
  { name: "started", data: { model: "claude-fake-1", tools: [] } },
  { name: "message", data: { text: "Five days." } },
  { name: "text", data: { text: "Let me save that." } },
  {
    name: "toolCall",
    data: { name: "mcp__trip__update_trip_brief", input: {} },
  },
  { name: "toolReply", data: { text: "Saved.", isError: false } },
  { name: "text", data: { text: "Five days it is." } },
  { name: "ended", data: { failure: null, durationMs: 1000, usage: null } },
];

function sentTurn(state: ChatState): ChatState {
  const actions: ChatAction[] = [
    { type: "sent", text: "Five days." },
    ...TURN.map((event): ChatAction => ({ type: "event", event })),
  ];
  return actions.reduce(chatReducer, state);
}

function shown(state: ChatState, raw: boolean): string[] {
  return shownCards(state.cards, raw).map((card) =>
    card.kind === "raw" ? card.event.name : `${card.kind}: ${card.text}`,
  );
}

describe("the chat view's cards", () => {
  it("joins each reply's parts into one card with Raw off", () => {
    const state = sentTurn(sentTurn(EMPTY_CHAT));
    const reply = "reply: Let me save that.\n\nFive days it is.";
    expect(shown(state, false)).toEqual([
      "user: Five days.",
      reply,
      "user: Five days.",
      reply,
    ]);
  });

  it("shows each step of the turn in order with Raw on", () => {
    expect(shown(sentTurn(EMPTY_CHAT), true)).toEqual([
      "user: Five days.",
      "started",
      "message",
      "reply: Let me save that.",
      "toolCall",
      "toolReply",
      "reply: Five days it is.",
      "ended",
    ]);
  });

  it("keeps a loaded session's messages apart, with no raw cards", () => {
    const state = chatReducer(sentTurn(EMPTY_CHAT), {
      type: "loaded",
      session: {
        sessionId: "session_aaaaaaaa",
        tripId: "trip_aaaaaaaa",
        messages: [
          { role: "user", text: "Five days." },
          { role: "coordinator", text: "Five days it is." },
          { role: "coordinator", text: "Anything else?" },
        ],
        turnRunning: false,
      },
    });
    expect(shown(state, true)).toEqual([
      "user: Five days.",
      "reply: Five days it is.",
      "reply: Anything else?",
    ]);
  });
});
