import type { WorkerType } from "../agent/worker-types.js";
import { callKindOf } from "../version-rebuild/call-kinds.js";
import {
  orderTimeOf,
  type RecordedCall,
  recordedTurnsOf,
} from "../version-rebuild/recorded-calls.js";
import { agentCallInputSchema } from "./worker-run.schema.js";

// One worker run as its session recorded it (#266).
export interface RecordedWorker {
  // The coordinator turn the worker ran in, as its trip version counts it.
  turn: number;
  workerType: WorkerType;
  workerBrief: string;
  // When the coordinator's Agent call for it was made.
  sentAt: Date;
  // Every call that reached the trip in the turn before the worker was sent, the
  // coordinator's and any earlier worker's, in that order. The turn's trip version is
  // the trip as the turn started, so these take it to the trip as the worker found it.
  callsBefore: RecordedCall[];
}

// Finds the worker run that the coordinator's Agent call started, from the session's
// transcripts: the coordinator's lines, and each worker's by its transcript key.
export function recordedWorkerOf(
  coordinatorLines: readonly unknown[],
  workerLines: ReadonlyMap<string, readonly unknown[]>,
  agentToolUseId: string,
): RecordedWorker {
  for (const turn of recordedTurnsOf(coordinatorLines, workerLines)) {
    const agentCall = turn.calls.find(
      (call) => call.agent === "" && call.toolUseId === agentToolUseId,
    );
    if (agentCall === undefined) {
      continue;
    }
    const sentAt = agentCall.usedAt;
    return {
      turn: turn.turn,
      ...agentCallInputSchema.parse(agentCall.input),
      sentAt,
      callsBefore: turn.calls.filter(
        (call) =>
          callKindOf(call.name) !== "skip" &&
          orderTimeOf(call).getTime() < sentAt.getTime(),
      ),
    };
  }
  throw new Error(
    `The coordinator's transcript has no Agent call ${agentToolUseId}.`,
  );
}
