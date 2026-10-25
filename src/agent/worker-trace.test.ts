import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  assistant,
  messageDelta,
  messageStart,
  messageStop,
  SESSION_ID,
  successResult,
  taskStarted,
  text,
  toolResult,
  toolUse,
  transcriptCall,
  transcriptLine,
} from "./fake-sdk-messages.schema.js";
import {
  runTrace,
  secondsOf,
  spanNamed,
  spans,
  spanTree,
  useTestTracer,
} from "./turn-trace.fake.js";
import type { ReadWorkerTranscript } from "./worker-trace.js";

useTestTracer();

// No worker exists yet (#60, #61, #64), so these use a made-up one.
const WORKER = { parentToolUseId: "agent-call-1", agentId: "worker-1" };

// The coordinator starts one worker, which calls one tool and replies. Each message
// comes a second after the one before it.
const WORKER_TURN: readonly SDKMessage[] = [
  messageStart("call-1"),
  assistant("call-1", [
    toolUse("agent-call-1", "Agent", { prompt: "Find coffee." }),
  ]),
  messageDelta(50),
  taskStarted("agent-call-1", "coffee-finder", "Find coffee near the hotel."),
  assistant(
    "worker-call-1",
    [toolUse("tool-1", "mcp__places__find_place", { query: "coffee" })],
    WORKER,
  ),
  toolResult("tool-1", "Blue Bottle", { fromWorker: WORKER }),
  toolResult("agent-call-1", "Blue Bottle, at the Ferry Building."),
  messageStart("call-2"),
  assistant("call-2", [text("Try Blue Bottle.")]),
  messageDelta(30),
  messageStop(),
  successResult("Try Blue Bottle."),
];

// The worker's transcript: its prompt, its first model call with a line for each of
// its two blocks, its tool result, and its last model call.
const WORKER_TRANSCRIPT: readonly unknown[] = [
  transcriptLine("user", 2, { role: "user", content: "Find coffee." }),
  transcriptLine(
    "assistant",
    4,
    transcriptCall("worker-call-1", 28, [
      { type: "thinking", thinking: "Search near the hotel.", signature: "" },
    ]),
  ),
  transcriptLine(
    "assistant",
    5,
    transcriptCall("worker-call-1", 175, [
      {
        type: "tool_use",
        id: "tool-1",
        name: "mcp__places__find_place",
        input: {},
      },
    ]),
  ),
  transcriptLine("user", 6, { role: "user", content: [] }),
  transcriptLine(
    "assistant",
    7,
    transcriptCall("worker-call-2", 306, [
      { type: "text", text: "Blue Bottle" },
    ]),
  ),
];

const READ_TRANSCRIPT: ReadWorkerTranscript = () =>
  Promise.resolve(WORKER_TRANSCRIPT);

describe("TurnTrace with a worker", () => {
  it("puts the worker's spans under the Agent call that started it", async () => {
    await runTrace(WORKER_TURN, READ_TRANSCRIPT);
    expect(spanTree()).toBe(
      [
        "coordinator.turn",
        "  coordinator.model_call",
        "  Agent",
        "    coffee-finder.turn",
        "      coffee-finder.model_call",
        "      mcp__places__find_place",
        "      coffee-finder.model_call",
        "  coordinator.model_call",
      ].join("\n"),
    );
  });

  it("reads the worker's transcript by the session and the worker's agent ID", async () => {
    const read = vi.fn<ReadWorkerTranscript>(READ_TRANSCRIPT);
    await runTrace(WORKER_TURN, read);
    expect(read).toHaveBeenCalledWith(SESSION_ID, "worker-1");
  });

  it("puts the worker's prompt and its result on its span", async () => {
    await runTrace(WORKER_TURN, READ_TRANSCRIPT);
    const worker = spanNamed("coffee-finder.turn");
    expect(worker.attributes).toMatchObject({
      "openinference.span.kind": "AGENT",
      "agent.name": "coffee-finder",
      "session.id": SESSION_ID,
      "input.value": "Find coffee near the hotel.",
      "output.value": "Blue Bottle, at the Ferry Building.",
    });
    // From the coordinator's Agent call to its result.
    expect([secondsOf(worker.startTime), secondsOf(worker.endTime)]).toEqual([
      2, 7,
    ]);
  });

  it("makes each model call from the worker's transcript, with its blocks and the tokens on its last line", async () => {
    await runTrace(WORKER_TURN, READ_TRANSCRIPT);
    const first = spanNamed("coffee-finder.model_call");
    expect(first.attributes).toMatchObject({
      "openinference.span.kind": "LLM",
      "llm.model_name": "claude-fake-2",
      "llm.token_count.prompt": 2000,
      "llm.token_count.completion": 175,
      "llm.output_messages.0.message.contents.0.message_content.text":
        "Search near the hotel.",
      "llm.output_messages.0.message.tool_calls.0.tool_call.function.name":
        "mcp__places__find_place",
    });
    // From when its prompt was written, to its last line.
    expect([secondsOf(first.startTime), secondsOf(first.endTime)]).toEqual([
      2, 5,
    ]);
    expect(secondsOf(spanNamed("coffee-finder.model_call", 1).startTime)).toBe(
      6,
    );
  });

  it("keeps the worker's messages out of the coordinator's model calls", async () => {
    await runTrace(WORKER_TURN, READ_TRANSCRIPT);
    const calls = spans().filter(
      (span) => span.name === "coordinator.model_call",
    );
    expect(calls).toHaveLength(2);
    expect(spanNamed("coordinator.model_call").attributes).toMatchObject({
      "llm.token_count.completion": 50,
      "output.value": JSON.stringify([
        { type: "tool_use", name: "Agent", input: { prompt: "Find coffee." } },
      ]),
    });
  });

  it("marks the worker as an error, and still ends the turn, when its transcript can't be read", async () => {
    await runTrace(WORKER_TURN);
    expect(spanNamed("coffee-finder.turn").status).toEqual({
      code: 2,
      message: "Couldn't read the worker's transcript: Error: No worker ran.",
    });
    expect(spanNamed("coordinator.turn").status.code).toBe(1);
    expect(spans().map((span) => span.name)).not.toContain(
      "coffee-finder.model_call",
    );
  });

  it("starts no model call span when a transcript line is bad", async () => {
    await runTrace(WORKER_TURN, () =>
      Promise.resolve([
        ...WORKER_TRANSCRIPT,
        transcriptLine("assistant", 8, { id: "worker-call-3" }),
      ]),
    );
    expect(spanNamed("coffee-finder.turn").status.code).toBe(2);
    expect(spans().map((span) => span.name)).not.toContain(
      "coffee-finder.model_call",
    );
  });
});
