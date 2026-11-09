import { z } from "zod";

import { isWorkerType, type WorkerType } from "../agent/worker-types.js";
import type { PlaceRow } from "../version-rebuild/rebuild-repositories.js";

// What a run of one recorded worker reads from outside the program (#266).

// The coordinator's Agent call that started the worker: its type, and the worker brief
// it was sent.
export const agentCallInputSchema = z
  .looseObject({ subagent_type: z.string(), prompt: z.string() })
  .transform((input, context) => {
    if (!isWorkerType(input.subagent_type)) {
      context.addIssue({
        code: "custom",
        message: `${input.subagent_type} isn't one of our workers.`,
      });
      return z.NEVER;
    }
    const workerType: WorkerType = input.subagent_type;
    return { workerType, workerBrief: input.prompt };
  });

// A live trip's place row, moved to the run's trip.
export function placeRowFor(row: PlaceRow, tripId: string): PlaceRow {
  return { ...row, whole: { ...row.whole, trip_id: tripId } };
}

// One case of the candidate refusals evaluation: a recorded worker run, by its session
// and the Agent call that started it, with what it did when it was recorded. Its splits
// are the trial sets it's in, such as trial-1, so an experiment can run a few cases
// before it runs them all.
const refusalCaseSchema = z.strictObject({
  agentSessionId: z.uuid(),
  agentToolUseId: z.string().min(1),
  workerType: z.string(),
  recordedCalls: z.number().int().nonnegative(),
  recordedRefused: z.number().int().nonnegative(),
  splits: z.array(z.string().min(1)),
});

export type RefusalCase = z.infer<typeof refusalCaseSchema>;

export const refusalCasesSchema = z.array(refusalCaseSchema);

// A dataset example's input, as Phoenix hands it to the experiment's task.
export const refusalExampleInputSchema = z.looseObject({
  agentSessionId: z.string(),
  agentToolUseId: z.string(),
});

// What one run of a case returns to the experiment, as its evaluators read it back.
export const refusalOutputSchema = z.looseObject({
  calls: z.number().int().nonnegative(),
  refused: z.number().int().nonnegative(),
});
