import {
  type ChatEvent,
  REPLY_PART_SEPARATOR,
  type SessionResponse,
  type ShownMessage,
} from "../../src/shared/session.schema";

// What the chat view shows: the conversation as cards, and the reply as it streams in
// (functional spec 10.1).

export interface CardBody {
  kind: "user" | "reply";
  // For a reply, a part of it, or a whole one from a loaded session.
  text: string;
}

export type Card = CardBody & {
  // For React's list keys.
  id: number;
  // The ID of the card that started the card's turn. The parts of one turn's reply are
  // joined into one card.
  turn: number;
};

// A turn the page streamed, so it knows the turn span's ID. It gets a row with the
// thumbs and the "View trace" link. Turns loaded from the transcript have no span ID
// (functional spec 10.1).
export interface StreamedTurn {
  turn: number;
  spanId: string;
  failed: boolean;
}

export interface ChatState {
  cards: Card[];
  streamedTurns: StreamedTurn[];
  // The session's ID in Phoenix, for the "View session" link. Null until the session
  // exists.
  agentSessionId: string | null;
  // The turn the next card belongs to.
  turn: number;
  // The tool the coordinator is running, such as update_trip_brief.
  tool: string | null;
  sending: boolean;
  // A turn the browser didn't see the end of, such as after the tab was closed, is
  // still running. The view asks again until it ends.
  turnRunning: boolean;
  error: string | null;
}

export const EMPTY_CHAT: ChatState = {
  cards: [],
  streamedTurns: [],
  agentSessionId: null,
  turn: 0,
  tool: null,
  sending: false,
  turnRunning: false,
  error: null,
};

export type ChatAction =
  | { type: "loaded"; session: SessionResponse }
  | { type: "sent"; text: string }
  | { type: "event"; event: ChatEvent }
  | { type: "failed"; message: string }
  // The reply's stream ended.
  | { type: "closed" };

// The turn goes on without the browser, so a reload shows the finished reply
// (systems design section 4).
export const CUT_OFF =
  "The connection closed before the reply finished. Reload the page to see the rest.";

const NOT_FINISHED = "The reply didn't finish. Try sending your message again.";

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        cards: action.session.messages.map(loadedCard),
        streamedTurns: [],
        agentSessionId: action.session.agentSessionId,
        turn: action.session.messages.length,
        turnRunning: action.session.turnRunning,
        error: null,
      };
    case "sent": {
      const turn = state.cards.length;
      return {
        ...withCard({ ...state, turn }, { kind: "user", text: action.text }),
        sending: true,
        error: null,
      };
    }
    case "event":
      return withEvent(state, action.event);
    case "failed":
      return { ...endReply(state), error: action.message };
    case "closed":
      return state.sending ? { ...endReply(state), error: CUT_OFF } : state;
  }
}

// Each loaded message is its own turn, so no two are joined.
function loadedCard(message: ShownMessage, id: number): Card {
  const kind = message.role === "user" ? "user" : "reply";
  return { kind, text: message.text, id, turn: id };
}

function withEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.name) {
    case "session":
      return { ...state, agentSessionId: event.data.agentSessionId };
    case "traced": {
      const streamed = { turn: state.turn, spanId: event.data.spanId };
      return {
        ...state,
        streamedTurns: [...state.streamedTurns, { ...streamed, failed: false }],
      };
    }
    case "text":
      return {
        ...withCard(state, { kind: "reply", text: event.data.text }),
        tool: null,
      };
    case "toolCall":
      return { ...state, tool: shortToolName(event.data.name) };
    case "ended":
      return event.data.failure === null
        ? { ...endReply(state), error: null }
        : { ...endReply(withTurnFailed(state)), error: NOT_FINISHED };
  }
}

function withTurnFailed(state: ChatState): ChatState {
  return {
    ...state,
    streamedTurns: state.streamedTurns.map((streamed) =>
      streamed.turn === state.turn ? { ...streamed, failed: true } : streamed,
    ),
  };
}

function endReply(state: ChatState): ChatState {
  return { ...state, tool: null, sending: false };
}

function withCard(state: ChatState, body: CardBody): ChatState {
  const card = { ...body, id: state.cards.length, turn: state.turn };
  return { ...state, cards: [...state.cards, card] };
}

// Such as update_trip_brief, from mcp__trip__update_trip_brief.
function shortToolName(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}

// The cards to show. The parts of each reply are one card, as a reload shows them.
export function shownCards(cards: readonly Card[]): Card[] {
  const shown: Card[] = [];
  for (const card of cards) {
    const last = shown.at(-1);
    if (
      card.kind === "reply" &&
      last?.kind === "reply" &&
      last.turn === card.turn
    ) {
      shown[shown.length - 1] = {
        ...last,
        text: `${last.text}${REPLY_PART_SEPARATOR}${card.text}`,
      };
    } else {
      shown.push(card);
    }
  }
  return shown;
}

export interface ShownCard {
  card: Card;
  // The streamed turn whose row goes under this card: its last card, once the turn
  // has ended. With no reply, that's the user's message.
  turnRow: StreamedTurn | null;
}

export function shownConversation(state: ChatState): ShownCard[] {
  const cards = shownCards(state.cards);
  return cards.map((card, index) => ({
    card,
    turnRow:
      cards[index + 1]?.turn === card.turn ? null : endedTurn(state, card.turn),
  }));
}

function endedTurn(state: ChatState, turn: number): StreamedTurn | null {
  if (state.sending && turn === state.turn) {
    return null;
  }
  return state.streamedTurns.find((streamed) => streamed.turn === turn) ?? null;
}
