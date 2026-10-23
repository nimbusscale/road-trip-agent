import { type KeyboardEvent, type SubmitEvent, useState } from "react";

import type { ChatState } from "./chat-state";
import { Link } from "./link";
import { type ChatStart, useChat } from "./use-chat";

// The chat view: the conversation, the reply as it streams in, and a box for the next
// message (functional spec 10.1). Opened from "New trip", it's the form that describes
// the trip, and its first message starts the trip.
export function ChatPage({ start }: { start: ChatStart }) {
  const { state, tripId, send } = useChat(start);
  const [draft, setDraft] = useState("");
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
      <p>
        {tripId === null ? (
          <Link to={{ page: "home" }}>Your trips</Link>
        ) : (
          <Link to={{ page: "trip", tripId }}>Back to the trip</Link>
        )}
      </p>
      {start.page === "newTrip" && state.lines.length === 0 ? (
        <p>
          Describe the trip you have in mind, such as where, when, and for how
          long. A rough idea is fine.
        </p>
      ) : null}
      <Conversation state={state} busy={busy} />
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

function Conversation({ state, busy }: { state: ChatState; busy: boolean }) {
  return (
    <div className="conversation">
      {state.lines.map((line) => (
        <p key={line.id} className={`line ${line.role}`}>
          {line.text}
        </p>
      ))}
      {state.reply === null ? null : (
        <p className="line coordinator">{state.reply}</p>
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
