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
    const calling = sentTurn(EMPTY_CHAT, TURN.slice(0, 2));
    expect(calling.tool).toBe("update_trip_brief");
    expect(sentTurn(EMPTY_CHAT, TURN.slice(0, 3)).tool).toBeNull();
  });

  it("keeps a loaded session's messages apart", () => {
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
    expect(shown(state)).toEqual([
      "user: Five days.",
      "reply: Five days it is.",
      "reply: Anything else?",
    ]);
  });
});
