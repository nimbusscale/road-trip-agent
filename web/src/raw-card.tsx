import { useState } from "react";

import type { RawEvent } from "./chat-state";

// A raw card: one step of a turn, for seeing how the coordinator works (functional spec
// 10.1).
export function RawCard({ event }: { event: RawEvent }) {
  return (
    <div className="card raw">
      <p className="raw-label">{labelOf(event)}</p>
      <RawBody event={event} />
    </div>
  );
}

function labelOf(event: RawEvent): string {
  switch (event.name) {
    case "started":
      return "Turn started";
    case "message":
      return "Message to the model";
    case "thinking":
      return "Thinking";
    case "toolCall":
      return `Tool call: ${event.data.name}`;
    case "toolReply":
      return event.data.isError ? "Tool error" : "Tool reply";
    case "system":
      return `System: ${event.data.subtype}`;
    case "ended":
      return event.data.failure === null ? "Turn ended" : "Turn failed";
  }
}

function RawBody({ event }: { event: RawEvent }) {
  switch (event.name) {
    case "started":
      return (
        <p>
          Model: {event.data.model}
          <br />
          Tools: {event.data.tools.join(", ")}
        </p>
      );
    case "message":
      return <Clipped text={event.data.text} />;
    case "thinking":
      // A summary ends with blank lines.
      return <Clipped text={event.data.text.trimEnd()} className="thinking" />;
    case "toolCall":
      return <Clipped text={jsonText(event.data.input)} />;
    case "toolReply":
      return <Clipped text={event.data.text} className="boxed" />;
    case "system":
      return <Clipped text={jsonText(event.data.data)} />;
    case "ended":
      return <EndedBody data={event.data} />;
  }
}

function EndedBody({
  data,
}: {
  data: Extract<RawEvent, { name: "ended" }>["data"];
}) {
  const { failure, durationMs, usage } = data;
  const parts = [`${(durationMs / 1000).toFixed(1)} s`];
  if (usage !== null) {
    parts.push(
      `${countText(usage.modelCalls)} model calls`,
      `${countText(usage.inputTokens)} input tokens (${countText(usage.cachedInputTokens)} from the cache)`,
      `${countText(usage.outputTokens)} output tokens`,
    );
  }
  return (
    <>
      <p>{parts.join(" · ")}</p>
      {failure === null ? null : <Clipped text={failure} className="boxed" />}
    </>
  );
}

function countText(count: number): string {
  return count.toLocaleString("en-US");
}

// `undefined` is a tool call with no input.
function jsonText(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

// Long text is cut to about 15 lines, with a button to show the rest. A line is cut at
// about 100 characters' worth, so one long line doesn't fill the view either.
const SHOWN_LINES = 15;
const SHOWN_CHARACTERS = SHOWN_LINES * 100;

function Clipped({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const cut = cutText(text);
  return (
    <>
      <pre className={className}>{open || cut === null ? text : cut}</pre>
      {cut === null ? null : (
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </>
  );
}

// Null when the text is short enough to show whole.
function cutText(text: string): string | null {
  const firstLines = text.split("\n").slice(0, SHOWN_LINES).join("\n");
  const cut = firstLines.slice(0, SHOWN_CHARACTERS);
  return cut.length < text.length ? `${cut}…` : null;
}
