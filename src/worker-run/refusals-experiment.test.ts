import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";

import {
  assistant,
  errorResult,
  successResult,
  toolResult,
  toolUse,
} from "../agent/fake-sdk-messages.schema.js";
import { WORKER_TYPE } from "../agent/worker-types.js";
import { CandidateCallCount } from "./candidate-calls.js";
import {
  noRefusalsOf,
  refusalRateOf,
  runOutputOf,
  visitTimeRefusalRateOf,
} from "./refusals-experiment.js";
import type { WorkerRun } from "./worker-run.js";

// A worker run as runRecordedWorker() builds it, from the SDK's messages.
function workerRunOf(messages: readonly SDKMessage[]): WorkerRun {
  const count = new CandidateCallCount();
  for (const message of messages) {
    count.record(message);
  }
  return {
    workerType: WORKER_TYPE.stayResearcher,
    turn: 3,
    userId: "c0ffee00-0000-4000-8000-000000000000",
    tripId: "trip_aaaaaaaa",
    spanId: "span-1",
    replay: [],
    candidates: count.counted,
    failure: count.failure,
  };
}

const CANDIDATE_CALL = [
  assistant("call-1", [
    toolUse("meal", "mcp__trip__add_stop_candidates", { stopId: "stop_a" }),
  ]),
  toolResult("meal", "Added 3 candidates."),
];

describe("runOutputOf", () => {
  it("gives the counts of a run that ended well", () => {
    expect(
      runOutputOf(workerRunOf([...CANDIDATE_CALL, successResult("Done.")])),
    ).toMatchObject({ calls: 1, refused: 0 });
  });

  it("fails the task when the run failed, so it isn't scored as a run with no refusals", () => {
    expect(() =>
      runOutputOf(
        workerRunOf([...CANDIDATE_CALL, errorResult(["API Error: 529"])]),
      ),
    ).toThrow("error_during_execution: API Error: 529");
  });

  it("fails the task when the run ended with no result", () => {
    expect(() => runOutputOf(workerRunOf(CANDIDATE_CALL))).toThrow("no result");
  });
});

describe("the scorers", () => {
  it("score a run's refused calls", () => {
    const output = { calls: 4, refused: 1, refusals: [{ reply: "No route." }] };
    expect(refusalRateOf(output)).toEqual({
      score: 0.25,
      label: "1 of 4 refused",
    });
    expect(noRefusalsOf(output)).toEqual({ score: 0, label: "some refused" });
  });

  it("give a run with no candidate calls no score, so it can't pass as a run with none refused", () => {
    const output = runOutputOf(workerRunOf([successResult("Done.")]));
    const noScore = { score: null, label: "no candidate calls" };
    expect(refusalRateOf(output)).toEqual(noScore);
    expect(noRefusalsOf(output)).toEqual(noScore);
    expect(visitTimeRefusalRateOf(output)).toEqual(noScore);
  });

  // The replies as the recorded runs got them: the MCP SDK's input validation error,
  // which is JSON, and the tool's own message.
  it("count only the refusals for visitTimeInMinutes in the visit time rate", () => {
    const schemaError = `MCP error -32602: Input validation error: [{"code": "unrecognized_keys", "message": "Unrecognized key: \\"visitTimeInMinutes\\""}]`;
    const toolMessage =
      'Nothing was changed. Day 2, Stop 5 (stop_a), meal: "dinner" is a meal stop, so each candidate takes a tier, and no visitTimeInMinutes.';
    const otherKinds = [
      "Nothing was changed. Google found no driving route from Port Angeles through Hurricane Ridge.",
      'Nothing was changed. Day 1, Stop 2 (stop_b), attraction: "towers" is an attraction stop, so each candidate takes visitTimeInMinutes, and no tier.',
    ];
    const replies = [schemaError, toolMessage, ...otherKinds];
    expect(
      visitTimeRefusalRateOf({
        calls: 8,
        refused: replies.length,
        refusals: replies.map((reply) => ({ tool: "add", reply })),
      }),
    ).toEqual({ score: 0.25, label: "2 of 8 refused for visitTimeInMinutes" });
  });
});
