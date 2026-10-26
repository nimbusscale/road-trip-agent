import {
  Fragment,
  type KeyboardEvent,
  type SubmitEvent,
  useState,
} from "react";

import {
  type ChatState,
  shownConversation,
  type StreamedTurn,
} from "./chat-state";
import { Link } from "./link";
import { MemoryPanel } from "./memory-panel";
import { sessionLink, traceLink } from "./phoenix-links";
import { PlanDownloads } from "./plan-downloads";
import { Rating, SessionRating } from "./rating";
import { ReplyText } from "./reply-text";
import { type ChatStart, useChat } from "./use-chat";

// The chat view: the conversation as cards, the reply as it streams in, and a box for
// the next message (functional spec 10.1). Opened from "New trip", it's the form that
// describes the trip, and its first message starts the trip. Once the session exists,
// "Memory" shows memory, the plan can be downloaded, and the session can be rated and
// opened in Phoenix. So can each turn the page streamed.
export function ChatPage({ start }: { start: ChatStart }) {
  const { state, tripId, sessionId, send } = useChat(start);
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
      <p className="chat-bar">
        {tripId === null ? (
          <Link to={{ page: "home" }}>Your trips</Link>
        ) : (
          <Link to={{ page: "trip", tripId }}>Back to the trip</Link>
        )}
      </p>
      {tripId === null || sessionId === null ? null : (
        <SessionTools
          tripId={tripId}
          sessionId={sessionId}
          agentSessionId={state.agentSessionId}
          busy={busy}
        />
      )}
      {start.page === "newTrip" && state.cards.length === 0 ? (
        <p>
          Describe the trip you have in mind, such as where, when, and for how
          long. A rough idea is fine.
        </p>
      ) : null}
      <Conversation state={state} sessionId={sessionId} busy={busy} />
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

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />{" "}
      {label}
    </label>
  );
}

interface SessionToolsProps {
  tripId: string;
  sessionId: string;
  agentSessionId: string | null;
  busy: boolean;
}

function SessionTools({
  tripId,
  sessionId,
  agentSessionId,
  busy,
}: SessionToolsProps) {
  const [memoryShown, setMemoryShown] = useState(false);
  return (
    <>
      <p className="chat-bar">
        <Toggle
          label="Memory"
          checked={memoryShown}
          onChange={setMemoryShown}
        />
        <span>
          <PlanDownloads tripId={tripId} />
        </span>
      </p>
      {memoryShown ? <MemoryPanel sessionId={sessionId} busy={busy} /> : null}
      <p className="turn-row">
        This session: <SessionRating sessionId={sessionId} />
        {agentSessionId === null ? null : (
          <PhoenixLink href={sessionLink(agentSessionId)}>
            View session
          </PhoenixLink>
        )}
      </p>
    </>
  );
}

// Opens Phoenix in a new tab.
function PhoenixLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

interface ConversationProps {
  state: ChatState;
  sessionId: string | null;
  busy: boolean;
}

function Conversation({ state, sessionId, busy }: ConversationProps) {
  return (
    <div className="conversation">
      {shownConversation(state).map(({ card, turnRow }) => (
        <Fragment key={card.id}>
          {card.kind === "reply" ? (
            <ReplyText text={card.text} />
          ) : (
            <p className={`card ${card.kind}`}>{card.text}</p>
          )}
          {turnRow === null || sessionId === null ? null : (
            <TurnRow sessionId={sessionId} streamed={turnRow} />
          )}
        </Fragment>
      ))}
      {busy ? (
        <p className="working">
          {state.tool === null ? "Working…" : `Working: ${state.tool}…`}
        </p>
      ) : null}
    </div>
  );
}

// The thumbs and "View trace" under a turn the page streamed (functional spec 10.1).
function TurnRow({
  sessionId,
  streamed,
}: {
  sessionId: string;
  streamed: StreamedTurn;
}) {
  return (
    <p className="turn-row">
      {streamed.failed ? "The reply didn't finish. " : null}
      <Rating
        path={`/api/sessions/${sessionId}/turns/${streamed.spanId}/rating`}
        startsAs={null}
      />
      <PhoenixLink href={traceLink(streamed.spanId)}>View trace</PhoenixLink>
    </p>
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
