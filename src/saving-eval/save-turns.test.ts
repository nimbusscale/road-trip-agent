import { describe, expect, it } from "vitest";

import type {
  CorpusSession,
  ToolResult,
} from "../grounded-eval/corpus-turn.js";
import { saveTurnsOf, SET_SIZE } from "./save-turns.js";

function call(tool: string, worker: string | null = null): ToolResult {
  return { tool, worker, refused: false, input: null, text: "" };
}

function sessionOf(sessionId: string, calls: ToolResult[][]): CorpusSession {
  return {
    sessionId,
    turns: calls.map((toolResults, index) => ({
      spanId: `${sessionId}-${String(index + 1)}`,
      traceId: `trace-${sessionId}-${String(index + 1)}`,
      userMessage: "",
      toolResults,
      reply: "",
    })),
  };
}

describe("saveTurnsOf", () => {
  it("finds the turns where the coordinator saved to the trip brief or memory", () => {
    const session = sessionOf("a", [
      [call("read_trip_brief")],
      [call("update_trip_brief")],
      [call("forget_memory_item")],
      [call("Agent", "stay-researcher"), call("update_trip_brief", "x")],
      [call("read_memory"), call("update_memory_item")],
      [call("add_memory_item")],
    ]);

    const turns = saveTurnsOf([session], "seed");

    expect(turns.map((turn) => turn.spanId).sort()).toEqual([
      "a-2",
      "a-5",
      "a-6",
    ]);
  });

  it("splits the turns into sets of 10, mixed across sessions", () => {
    const sessions = ["a", "b", "c"].map((id) =>
      sessionOf(
        id,
        Array.from({ length: 10 }, () => [call("add_memory_item")]),
      ),
    );

    const turns = saveTurnsOf(sessions, "seed");

    expect(turns.map((turn) => turn.set)).toEqual(
      Array.from(
        { length: 30 },
        (unused, index) => Math.floor(index / SET_SIZE) + 1,
      ),
    );
    const firstSet = new Set(
      turns.filter((turn) => turn.set === 1).map((turn) => turn.sessionId),
    );
    expect(firstSet.size).toBeGreaterThan(1);
    expect(saveTurnsOf(sessions, "seed")).toEqual(turns);
  });
});
