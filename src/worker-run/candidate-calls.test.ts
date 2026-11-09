import { describe, expect, it } from "vitest";

import {
  assistant,
  toolResult,
  toolUse,
} from "../agent/fake-sdk-messages.schema.js";
import { CandidateCallCount } from "./candidate-calls.js";

const STOP_CANDIDATES = "mcp__trip__add_stop_candidates";

describe("CandidateCallCount", () => {
  it("counts each candidate call that got a reply, and keeps each refusal's reply", () => {
    const count = new CandidateCallCount();
    for (const message of [
      assistant("call-1", [
        toolUse("meal", STOP_CANDIDATES, { stopId: "stop_a" }),
        toolUse("search", "mcp__places__search_near", {}),
      ]),
      toolResult("meal", "MCP error -32602: Input validation error", {
        isError: true,
      }),
      toolResult("search", "No places found.", { isError: true }),
      assistant("call-2", [
        toolUse("lodging", "mcp__trip__add_lodging_candidates", {}),
      ]),
      toolResult("lodging", "Added 3 candidates."),
      assistant("call-3", [toolUse("unanswered", STOP_CANDIDATES, {})]),
    ]) {
      count.record(message);
    }

    expect(count.counted).toEqual({
      calls: 2,
      refused: 1,
      refusals: [
        {
          tool: STOP_CANDIDATES,
          reply: "MCP error -32602: Input validation error",
        },
      ],
    });
  });
});
