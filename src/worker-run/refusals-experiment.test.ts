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
import { runOutputOf } from "./refusals-experiment.js";
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
