import {
  type ChatEvent,
  REPLY_PART_SEPARATOR,
  type SessionResponse,
  type ShownMessage,
} from "../../src/shared/session.schema";

// What the chat view shows: the conversation as cards, and the reply as it streams in
// (functional spec 10.1).

// A turn's events for the raw view: all but the session and the reply's text.
export type RawEvent = Exclude<ChatEvent, { name: "session" | "text" }>;

export type CardBody =
  | { kind: "user"; text: string }
  // A part of a reply, or a whole one from a loaded session.
  | { kind: "reply"; text: string }
  | { kind: "raw"; event: RawEvent };

export type Card = CardBody & {
  // For React's list keys.
  id: number;
  // The ID of the card that started the card's turn. The raw view shows each part of a
  // reply as its own card, in its place among the raw cards. Without it, the parts of
  // one turn's reply are joined into one card.
  turn: number;
};

export interface ChatState {
  // Raw cards come only from the replies this tab streamed, and are kept only here.
  cards: Card[];
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
      return state;
    case "text":
      return {
        ...withCard(state, { kind: "reply", text: event.data.text }),
        tool: null,
      };
    case "toolCall":
      return {
        ...withCard(state, { kind: "raw", event }),
        tool: shortToolName(event.data.name),
      };
    case "ended":
      return {
        ...endReply(withCard(state, { kind: "raw", event })),
        error: event.data.failure === null ? null : NOT_FINISHED,
      };
    default:
      return withCard(state, { kind: "raw", event });
  }
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

// The cards to show. With the raw view off, there are no raw cards, and the parts of
// each reply are one card, as a reload shows them.
export function shownCards(cards: readonly Card[], raw: boolean): Card[] {
  if (raw) {
    return [...cards];
  }
  const shown: Card[] = [];
  for (const card of cards) {
    const last = shown.at(-1);
    if (card.kind === "raw") {
      continue;
    }
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
