import { createClient } from "@arizeai/phoenix-client";
import { createDataset } from "@arizeai/phoenix-client/datasets";
import {
  asExperimentEvaluator,
  runExperiment,
} from "@arizeai/phoenix-client/experiments";

import { datasetListSchema } from "../grounded-eval/golden-set.schema.js";
import {
  runRecordedWorker,
  type WorkerRun,
  type WorkerRunGiven,
} from "./worker-run.js";
import {
  type RefusalCase,
  refusalExampleInputSchema,
  refusalOutputSchema,
} from "./worker-run.schema.js";

// The candidate refusals evaluation (#266): each case is a recorded worker run that had
// a candidate call refused. An experiment runs each one again on today's code, and code
// scores how many of its candidate calls were refused. No judge.

export const REFUSALS_DATASET = "candidate-refusals";

// Three workers at a time keeps the runs inside the Claude plan's limits. Each one is a
// Claude Code process with its own model calls.
const CONCURRENCY = 3;

type PhoenixClient = ReturnType<typeof createClient>;

// Saves the cases as the dataset, once. A later change to the cases goes in as a new
// version of the dataset, not by deleting it, since that deletes its experiments
// (DEVELOPMENT.md section 5).
export async function saveRefusalsDataset(
  phoenixUrl: string,
  cases: readonly RefusalCase[],
): Promise<string> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  if ((await datasetIdOf(client)) !== null) {
    return `${REFUSALS_DATASET} is already in Phoenix, so nothing was saved.`;
  }
  await createDataset({
    client,
    name: REFUSALS_DATASET,
    description:
      "The candidate refusals evaluation (#266): recorded worker runs that had a candidate call refused.",
    examples: cases.map(
      ({ agentSessionId, agentToolUseId, splits, ...recorded }) => ({
        input: { agentSessionId, agentToolUseId },
        output: {},
        metadata: recorded,
        splits,
      }),
    ),
  });
  return `Saved ${String(cases.length)} cases as ${REFUSALS_DATASET}.`;
}

async function datasetIdOf(client: PhoenixClient): Promise<string | null> {
  const response = await client.GET("/v1/datasets", {
    params: { query: { name: REFUSALS_DATASET } },
  });
  return datasetListSchema.parse(response.data)[0]?.id ?? null;
}

// Which cases an experiment runs, and how many times each.
export interface RefusalsSelection {
  // A trial set, such as trial-1, or null for every case.
  split: string | null;
  runsPerCase: number;
}

// Runs the selected cases as a Phoenix experiment. Each run's worker spans go under its
// task's span in the experiment's trace. The description says what the commit changed.
export async function runRefusalsExperiment(
  phoenixUrl: string,
  given: WorkerRunGiven,
  description: string,
  selection: RefusalsSelection,
): Promise<void> {
  const { split, runsPerCase } = selection;
  await runExperiment({
    client: createClient({ options: { baseUrl: phoenixUrl } }),
    experimentName: `candidate refusals ${split ?? "all"} ${given.commit.slice(0, 7)}`,
    experimentDescription: description,
    experimentMetadata: {
      commit: given.commit,
      split: split ?? "all",
      runsPerCase,
      stayResearcherModel: given.settings.stayResearcherModel,
      legScoutModel: given.settings.legScoutModel,
    },
    dataset: {
      datasetName: REFUSALS_DATASET,
      ...(split === null ? {} : { splits: [split] }),
    },
    task: async (example) =>
      runOutputOf(
        await runRecordedWorker(
          given,
          refusalExampleInputSchema.parse(example.input),
        ),
      ),
    evaluators: [refusalRate, noRefusals],
    concurrency: CONCURRENCY,
    repetitions: runsPerCase,
  });
}

// What Phoenix keeps for each run: the counts, each refusal's reply, and where to look,
// the run's trip and span. A run that failed, such as on the Claude plan's limit, fails
// its task, so Phoenix shows it as an error and its evaluators give it no score. Its
// counts would score it as a run with no refusals.
export function runOutputOf(run: WorkerRun): Record<string, unknown> {
  if (run.failure !== null) {
    throw new Error(
      `The worker run failed: ${run.failure} (span ${run.spanId}).`,
    );
  }
  return {
    calls: run.candidates.calls,
    refused: run.candidates.refused,
    refusals: run.candidates.refusals,
    tripId: run.tripId,
    spanId: run.spanId,
    replay: run.replay,
  };
}

// A scorer's result. The score is null for a run with no candidate calls: it has no
// rate, and a best score would pull its case's rate down. A fix could leave a worker
// making no candidate calls, so that run mustn't look like a good one.
export interface RefusalScore {
  score: number | null;
  label: string;
}

const NO_CALLS: RefusalScore = { score: null, label: "no candidate calls" };

// The share of the run's candidate calls that were refused. Lower is better.
export function refusalRateOf(output: unknown): RefusalScore {
  const { calls, refused } = refusalOutputSchema.parse(output);
  if (calls === 0) {
    return NO_CALLS;
  }
  return {
    score: refused / calls,
    label: `${String(refused)} of ${String(calls)} refused`,
  };
}

// Whether the run had no refused candidate call at all.
export function noRefusalsOf(output: unknown): RefusalScore {
  const { calls, refused } = refusalOutputSchema.parse(output);
  if (calls === 0) {
    return NO_CALLS;
  }
  return refused === 0
    ? { score: 1, label: "none refused" }
    : { score: 0, label: "some refused" };
}

const refusalRate = asExperimentEvaluator({
  name: "refusal rate",
  kind: "CODE",
  evaluate: ({ output }) => refusalRateOf(output),
});

const noRefusals = asExperimentEvaluator({
  name: "no refusals",
  kind: "CODE",
  evaluate: ({ output }) => noRefusalsOf(output),
});
