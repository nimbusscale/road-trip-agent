import { describe, expect, it } from "vitest";

import { corpusSessionOf } from "./corpus-turn.js";
import { judgeInputOf } from "./judge-input.js";
import type { PhoenixSpan } from "./phoenix-span.schema.js";

function span(fields: Partial<PhoenixSpan> & { spanId: string }): PhoenixSpan {
  return {
    name: "coordinator.turn",
    traceId: "trace",
    parentId: null,
    kind: "AGENT",
    startTime: "2026-11-04T17:00:00Z",
    failed: false,
    sessionId: "session",
    input: "",
    output: "",
    ...fields,
  };
}

// Two turns. The first called a trip tool, which was refused, and a worker, which
// searched on its own. The second called nothing.
const SPANS = [
  span({
    spanId: "turn-2",
    startTime: "2026-11-04T17:05:00Z",
    input: "Is it open Mondays?",
    output: "Yes, from 9:00 a.m.",
  }),
  span({
    spanId: "turn-1",
    input: "Find a museum.",
    output: "The Space Museum opens at 9:00 a.m.",
  }),
  span({
    spanId: "refused",
    name: "mcp__trip__add_stops",
    kind: "TOOL",
    parentId: "turn-1",
    startTime: "2026-11-04T17:01:00Z",
    failed: true,
    input: '{"dayId":"day_1"}',
    output: "Nothing was changed.",
  }),
  span({
    spanId: "agent",
    name: "Agent",
    kind: "TOOL",
    parentId: "turn-1",
    startTime: "2026-11-04T17:02:00Z",
    input: '{"subagent_type":"stay-researcher","prompt":"Find a museum."}',
    output: "Space Museum: open daily 9:00 a.m. to 5:00 p.m.",
  }),
  span({
    spanId: "worker-search",
    name: "mcp__places__search_near",
    kind: "TOOL",
    parentId: "worker-turn",
    startTime: "2026-11-04T17:02:30Z",
    output: "A search only the worker saw.",
  }),
];

describe("judgeInputOf", () => {
  const session = corpusSessionOf("session", SPANS);

  it("ends with the reply to judge, after the earlier turns and their results", () => {
    expect(judgeInputOf(session, "turn-2")).toBe(
      [
        '<turn number="1">',
        "<user_message>\nFind a museum.\n</user_message>",
        '<tool_result tool="add_stops" refused="true">\nNothing was changed.\n</tool_result>',
        '<worker_result worker="stay-researcher">\nSpace Museum: open daily 9:00 a.m. to 5:00 p.m.\n</worker_result>',
        "<coordinator_reply>\nThe Space Museum opens at 9:00 a.m.\n</coordinator_reply>",
        "</turn>",
        "",
        '<turn number="2">',
        "<user_message>\nIs it open Mondays?\n</user_message>",
        "<reply_to_judge>\nYes, from 9:00 a.m.\n</reply_to_judge>",
        "</turn>",
      ].join("\n"),
    );
  });

  it("stops at the turn judged, leaving out the turns after it", () => {
    expect(judgeInputOf(session, "turn-1")).toMatch(
      /<reply_to_judge>\nThe Space Museum opens at 9:00 a\.m\.\n<\/reply_to_judge>\n<\/turn>$/,
    );
  });
});
