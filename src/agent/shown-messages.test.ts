import { describe, expect, it } from "vitest";

import { shownMessagesOf } from "./shown-messages.js";

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
