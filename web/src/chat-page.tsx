import { type KeyboardEvent, type SubmitEvent, useState } from "react";

import { type ChatState, shownCards } from "./chat-state";
import { Link } from "./link";
import { RawCard } from "./raw-card";
import { ReplyText } from "./reply-text";
import { type ChatStart, useChat } from "./use-chat";

// The chat view: the conversation as cards, the reply as it streams in, and a box for
// the next message (functional spec 10.1). Opened from "New trip", it's the form that
// describes the trip, and its first message starts the trip. "Raw" adds each turn's
// steps to the conversation.
export function ChatPage({ start }: { start: ChatStart }) {
  const { state, tripId, send } = useChat(start);
  const [draft, setDraft] = useState("");
  const [raw, setRaw] = useState(false);
  const busy = state.sending || state.turnRunning;

  function submit(): void {
    const text = draft.trim();
    if (text === "" || busy) {
      return;
    }
    send(text);
    setDraft("");
  }

  return (
    <>
      <p className="chat-bar">
        {tripId === null ? (
          <Link to={{ page: "home" }}>Your trips</Link>
        ) : (
          <Link to={{ page: "trip", tripId }}>Back to the trip</Link>
        )}
        <label>
          <input
            type="checkbox"
            checked={raw}
            onChange={(event) => {
              setRaw(event.target.checked);
            }}
          />{" "}
          Raw
        </label>
      </p>
      {start.page === "newTrip" && state.cards.length === 0 ? (
        <p>
          Describe the trip you have in mind, such as where, when, and for how
          long. A rough idea is fine.
        </p>
      ) : null}
      <Conversation state={state} raw={raw} busy={busy} />
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <MessageForm
        draft={draft}
        busy={busy}
        onChange={setDraft}
        onSubmit={submit}
      />
    </>
  );
}

interface ConversationProps {
  state: ChatState;
  raw: boolean;
  busy: boolean;
}

function Conversation({ state, raw, busy }: ConversationProps) {
  return (
    <div className="conversation">
      {shownCards(state.cards, raw).map((card) =>
        card.kind === "raw" ? (
          <RawCard key={card.id} event={card.event} />
        ) : card.kind === "reply" && !raw ? (
          // With "Raw" on, a reply shows the Markdown exactly as the coordinator wrote it.
          <ReplyText key={card.id} text={card.text} />
        ) : (
          <p key={card.id} className={`card ${card.kind}`}>
            {card.text}
          </p>
        ),
      )}
      {busy ? (
        <p className="working">
          {state.tool === null ? "Working…" : `Working: ${state.tool}…`}
        </p>
      ) : null}
    </div>
  );
}

interface MessageFormProps {
  draft: string;
  busy: boolean;
  onChange: (draft: string) => void;
  onSubmit: () => void;
}

// Enter sends, and Shift-Enter starts a new line.
function MessageForm({ draft, busy, onChange, onSubmit }: MessageFormProps) {
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <form onSubmit={submit}>
      <textarea
        aria-label="Message"
        rows={3}
        value={draft}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={sendOnEnter}
      />
      <button type="submit" disabled={busy || draft.trim() === ""}>
        Send
      </button>
    </form>
  );
}
