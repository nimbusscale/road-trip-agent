import { describe, expect, it } from "vitest";

import {
  shownMessagesOf,
  turnMessageIndex,
  userMessageCount,
} from "./shown-messages.js";

// Shaped like the lines the Agent SDK stores, cut down to what's read.
const LINES = [
  { type: "queue-operation", content: "Today is Friday…" },
  {
    type: "user",
    isSidechain: false,
    message: {
      role: "user",
      content: "Today is Friday, October 23, 2026.\n\nPlan a Texas BBQ trip",
    },
  },
  { type: "attachment", attachment: { type: "date" } },
  {
    type: "assistant",
    isSidechain: false,
    message: {
      content: [{ type: "tool_use", name: "mcp__trip__read_trip_brief" }],
    },
  },
  {
    type: "user",
    isSidechain: false,
    message: {
      role: "user",
      content: [{ type: "tool_result", content: "focus: not set" }],
    },
  },
  {
    type: "assistant",
    isSidechain: false,
    message: { content: [{ type: "text", text: "Great idea." }] },
  },
  {
    type: "assistant",
    isSidechain: false,
    message: { content: [{ type: "text", text: "How many days?" }] },
  },
  {
    type: "user",
    isMeta: true,
    message: { role: "user", content: "Something the SDK added" },
  },
];

describe("shownMessagesOf", () => {
  it("shows the user's own words and the coordinator's text, one message per reply", () => {
    expect(shownMessagesOf(LINES)).toEqual([
      { role: "user", text: "Plan a Texas BBQ trip" },
      { role: "coordinator", text: "Great idea.\n\nHow many days?" },
    ]);
  });
});

const SECOND_MESSAGE = {
  type: "user",
  message: { role: "user", content: "Five days." },
};

describe("userMessageCount", () => {
  // A trip version's turn number comes from it (persistence design, section 8.9).
  it("counts the user's messages, but not a tool's reply or a line the SDK added", () => {
    expect(userMessageCount([...LINES, SECOND_MESSAGE])).toBe(2);
  });
});

describe("turnMessageIndex", () => {
  const lines = [...LINES, SECOND_MESSAGE];

  it("finds each turn's message, after the app's lines", () => {
    expect(turnMessageIndex(lines, 1, "Plan a Texas BBQ trip")).toBe(1);
    expect(turnMessageIndex(lines, 2, "Five days.")).toBe(8);
  });

  it("refuses a message that isn't the one the trip version saved", () => {
    expect(() => turnMessageIndex(lines, 1, "Five days.")).toThrow(
      "Turn 1's message in the transcript isn't the one its trip version saved.",
    );
  });

  it("refuses a turn the transcript doesn't have", () => {
    expect(() => turnMessageIndex(lines, 3, "Make it six.")).toThrow(
      "The transcript has no turn 3.",
    );
  });

  it("refuses a trip version saved before its message was kept", () => {
    expect(() => turnMessageIndex(lines, 1, "")).toThrow(
      "Turn 1's trip version has no user message, so its place in the transcript can't be checked.",
    );
  });
});
