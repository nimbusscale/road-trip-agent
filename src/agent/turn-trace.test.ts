import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";

import {
  API_RETRY_FIELDS,
  apiRetry,
  assistant,
  errorResult,
  init,
  messageDelta,
  messageStart,
  messageStop,
  SESSION_ID,
  successResult,
  text,
  thinking,
  thinkingTokens,
  toolResult,
  toolUse,
} from "./fake-sdk-messages.schema.js";
import {
  MESSAGE,
  runThrowingTrace,
  runTrace,
  secondsOf,
  spanNamed,
  spans,
  spanTree,
  USER_ID,
  useTestTracer,
} from "./turn-trace.fake.js";

useTestTracer();

// The turn's start, one model call that thinks and asks for a tool, the tool's result,
// and a second model call that replies. Each message comes a second after the one
// before it.
const ONE_TOOL_TURN: readonly SDKMessage[] = [
  init("claude-fake-1", ["mcp__trip__read_trip_brief", "Agent"]),
  messageStart("call-1"),
  assistant("call-1", [thinking("They want Boston.")]),
  assistant("call-1", [
    toolUse("tool-1", "mcp__trip__read_trip_brief", { tripId: "trip-1" }),
  ]),
  messageDelta(470),
  messageStop(),
  toolResult("tool-1", "The brief is empty."),
  messageStart("call-2"),
  assistant("call-2", [text("Where in Boston?")]),
  messageDelta(120),
  messageStop(),
  successResult("Where in Boston?"),
];

describe("TurnTrace", () => {
  it("makes a span for the turn, each model call, and each tool call, in order", async () => {
    await runTrace(ONE_TOOL_TURN);
    expect(spanTree()).toBe(
      [
        "coordinator.turn",
        "  coordinator.model_call",
        "  mcp__trip__read_trip_brief",
        "  coordinator.model_call",
      ].join("\n"),
    );
  });

  it("puts the message the model got, the reply, the session, and the user on the turn's span", async () => {
    await runTrace(ONE_TOOL_TURN);
    const turn = spanNamed("coordinator.turn");
    expect(turn.attributes).toMatchObject({
      "openinference.span.kind": "AGENT",
      "input.value": MESSAGE,
      "output.value": "Where in Boston?",
      "session.id": SESSION_ID,
      "user.id": USER_ID,
    });
    expect(turn.status.code).toBe(1);
  });

  it("puts the turn's start on its span, with the model and the tools", async () => {
    await runTrace(ONE_TOOL_TURN);
    const [started] = spanNamed("coordinator.turn").events;
    expect(started?.name).toBe("started");
    expect(started?.attributes).toEqual({
      model: "claude-fake-1",
      tools: ["mcp__trip__read_trip_brief", "Agent"],
    });
    expect(started === undefined ? null : secondsOf(started.time)).toBe(1);
  });

  it("puts each of the SDK's other system messages on the turn's span, such as a retry", async () => {
    await runTrace([
      messageStart("call-1"),
      thinkingTokens(40),
      apiRetry(),
      assistant("call-1", [text("Hi.")]),
      successResult("Hi."),
    ]);
    const events = spanNamed("coordinator.turn").events;
    // Thinking token counts get no event.
    expect(events.map((event) => event.name)).toEqual(["api_retry"]);
    const [retry] = events;
    expect(retry?.attributes).toEqual({
      data: JSON.stringify(API_RETRY_FIELDS),
    });
    expect(retry === undefined ? null : secondsOf(retry.time)).toBe(3);
  });

  it("puts the full reason a turn failed in its status", async () => {
    await runTrace([
      messageStart("call-1"),
      errorResult(["API Error: 529 Overloaded", "Gave up after 10 tries."]),
    ]);
    expect(spanNamed("coordinator.turn").status).toEqual({
      code: 2,
      message:
        "error_during_execution: API Error: 529 Overloaded: Gave up after 10 tries.",
    });
  });

  it("puts the error's text in the turn's status when the SDK throws", async () => {
    await runThrowingTrace(
      [messageStart("call-1")],
      new Error("Claude Code process exited with code 1"),
    );
    expect(spanNamed("coordinator.turn").status).toEqual({
      code: 2,
      message: "Error: Claude Code process exited with code 1",
    });
  });

  it("puts a model call's thinking, tool calls, and final tokens on its span", async () => {
    await runTrace(ONE_TOOL_TURN);
    expect(spanNamed("coordinator.model_call").attributes).toMatchObject({
      "openinference.span.kind": "LLM",
      "llm.model_name": "claude-fake-1",
      "llm.output_messages.0.message.contents.0.message_content.type":
        "reasoning",
      "llm.output_messages.0.message.contents.0.message_content.text":
        "They want Boston.",
      "llm.output_messages.0.message.tool_calls.0.tool_call.function.name":
        "mcp__trip__read_trip_brief",
      // The prompt counts the cache's tokens: 10 + 9,000 + 1,000.
      "llm.token_count.prompt": 10010,
      "llm.token_count.prompt_details.cache_read": 9000,
      "llm.token_count.prompt_details.cache_write": 1000,
      // From message_delta, not the 8 each block carries from the call's start.
      "llm.token_count.completion": 470,
      "llm.token_count.total": 10480,
    });
  });

  it("puts a tool's input and result on its span", async () => {
    await runTrace(ONE_TOOL_TURN);
    expect(spanNamed("mcp__trip__read_trip_brief").attributes).toMatchObject({
      "openinference.span.kind": "TOOL",
      "input.value": JSON.stringify({ tripId: "trip-1" }),
      "output.value": "The brief is empty.",
    });
  });

  it("times each span from the stream events and the tool's result", async () => {
    await runTrace(ONE_TOOL_TURN);
    const times = (name: string, index = 0): number[] => {
      const span = spanNamed(name, index);
      return [secondsOf(span.startTime), secondsOf(span.endTime)];
    };
    // The first call runs from message_start to message_stop. The tool runs from
    // its call to its result. The second call starts at message_start.
    expect(times("coordinator.model_call")).toEqual([2, 6]);
    expect(times("mcp__trip__read_trip_brief")).toEqual([4, 7]);
    expect(times("coordinator.model_call", 1)).toEqual([8, 11]);
  });

  it("starts a model call when the last tool result arrived, when no stream event came", async () => {
    await runTrace([
      assistant("call-1", [toolUse("tool-1", "mcp__trip__read_itinerary", {})]),
      toolResult("tool-1", "No days yet."),
      assistant("call-2", [text("Let's start.")]),
      successResult("Let's start."),
    ]);
    expect(secondsOf(spanNamed("coordinator.model_call", 1).startTime)).toBe(2);
  });

  it("marks a refused tool call as an error, with the tool's text", async () => {
    await runTrace([
      messageStart("call-1"),
      assistant("call-1", [
        toolUse("tool-1", "mcp__trip__set_trip_length", {}),
      ]),
      toolResult("tool-1", "A trip is at most 14 days long.", {
        isError: true,
      }),
      successResult("Sorry."),
    ]);
    expect(spanNamed("mcp__trip__set_trip_length").status).toEqual({
      code: 2,
      message: "A trip is at most 14 days long.",
    });
  });

  it("ends every span, as errors, when the turn stops before its result", async () => {
    await runTrace([
      messageStart("call-1"),
      assistant("call-1", [toolUse("tool-1", "mcp__places__find_place", {})]),
    ]);
    expect(spans()).toHaveLength(3);
    expect(spanNamed("mcp__places__find_place").status).toEqual({
      code: 2,
      message: "The turn ended before the tool's result.",
    });
    expect(spanNamed("coordinator.turn").status).toEqual({
      code: 2,
      message: "The turn ended with no result.",
    });
  });
});
