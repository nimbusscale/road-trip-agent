import {
  type ChatEvent,
  REPLY_PART_SEPARATOR,
  type SessionResponse,
  type ShownMessage,
} from "../../src/shared/session.schema";

// What the chat view shows: the conversation so far, and the reply as it streams in.

export interface Line extends ShownMessage {
  // For React's list keys.
  id: number;
}

export interface ChatState {
  lines: Line[];
  // The reply streaming in now. Null while no reply is.
  reply: string | null;
  // The tool the coordinator is running, such as update_trip_brief.
  tool: string | null;
  sending: boolean;
  // A turn the browser didn't see the end of, such as after the tab was closed, is
  // still running. The view asks again until it ends.
  turnRunning: boolean;
  error: string | null;
}

export const EMPTY_CHAT: ChatState = {
  lines: [],
  reply: null,
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

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        lines: action.session.messages.map((message, id) => ({
          ...message,
          id,
        })),
        turnRunning: action.session.turnRunning,
        error: null,
      };
    case "sent":
      return {
        ...withLine(state, { role: "user", text: action.text }),
        sending: true,
        error: null,
      };
    case "event":
      return withEvent(state, action.event);
    case "failed":
      return { ...endReply(state), error: action.message };
    case "closed":
      return state.sending ? { ...endReply(state), error: CUT_OFF } : state;
  }
}

function withEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.name) {
    case "session":
      return state;
    case "text":
      return {
        ...state,
        reply:
          state.reply === null
            ? event.data.text
            : `${state.reply}${REPLY_PART_SEPARATOR}${event.data.text}`,
        tool: null,
      };
    case "tool":
      return { ...state, tool: event.data.name };
    case "ended":
      return {
        ...endReply(state),
        error: event.data.succeeded
          ? null
          : "The reply didn't finish. Try sending your message again.",
      };
  }
}

// The reply so far becomes a line of the conversation.
function endReply(state: ChatState): ChatState {
  const ended =
    state.reply === null
      ? state
      : withLine(state, { role: "coordinator", text: state.reply });
  return { ...ended, reply: null, tool: null, sending: false };
}

function withLine(state: ChatState, message: ShownMessage): ChatState {
  return {
    ...state,
    lines: [...state.lines, { ...message, id: state.lines.length }],
  };
}
