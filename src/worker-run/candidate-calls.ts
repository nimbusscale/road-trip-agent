import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { toolsOn } from "../agent/tool-names.js";
import { callBlocksOf } from "../agent/trace-spans.js";
import {
  failureOf,
  toolResultsOf,
  toolResultText,
} from "../agent/turn-event.js";
import { TRIP_SERVER_NAME } from "../tools/trip-server.js";

// The tools the candidate refusals evaluation counts (#266).
const CANDIDATE_TOOLS: ReadonlySet<string> = new Set(
  toolsOn(TRIP_SERVER_NAME, [
    "add_meal_candidates",
    "add_attraction_candidates",
    "add_lodging_candidates",
  ]),
);

export interface CandidateRefusal {
  tool: string;
  // The reply the worker got: the tool's own message, or the MCP SDK's input
  // validation error.
  reply: string;
}

export interface CandidateCalls {
  // Each candidate call that got a reply.
  calls: number;
  refused: number;
  refusals: CandidateRefusal[];
}

// Counts a run's candidate calls, and the ones refused, from the SDK's messages. A
// refused call is one whose result is marked as an error, as on its trace span.
export class CandidateCallCount {
  readonly #waiting = new Map<string, string>();
  readonly #counted: CandidateCalls = { calls: 0, refused: 0, refusals: [] };
  #failure: string | null = "The run ended with no result.";

  record(message: SDKMessage): void {
    if (message.type === "result") {
      this.#failure = failureOf(message);
    } else if (message.type === "assistant") {
      for (const block of callBlocksOf(message.message.content)) {
        if (block.type === "toolUse" && CANDIDATE_TOOLS.has(block.name)) {
          this.#waiting.set(block.id, block.name);
        }
      }
    } else if (message.type === "user") {
      for (const block of toolResultsOf(message.message.content)) {
        this.#recordResult(block);
      }
    }
  }

  get counted(): CandidateCalls {
    return this.#counted;
  }

  // Why the run failed, such as when the Claude API failed, or null when it ended well.
  // A failed run's counts say nothing about the worker.
  get failure(): string | null {
    return this.#failure;
  }

  #recordResult(block: ReturnType<typeof toolResultsOf>[number]): void {
    const tool = this.#waiting.get(block.tool_use_id);
    if (tool === undefined) {
      return;
    }
    this.#waiting.delete(block.tool_use_id);
    this.#counted.calls++;
    if (block.is_error === true) {
      this.#counted.refused++;
      this.#counted.refusals.push({ tool, reply: toolResultText(block) });
    }
  }
}
