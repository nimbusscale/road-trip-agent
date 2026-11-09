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

// Each case is run 5 times, so a change can be told apart from the run-to-run
// differences.
const REPETITIONS = 5;

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
    examples: cases.map(({ agentSessionId, agentToolUseId, ...recorded }) => ({
      input: { agentSessionId, agentToolUseId },
      output: {},
      metadata: recorded,
    })),
  });
  return `Saved ${String(cases.length)} cases as ${REFUSALS_DATASET}.`;
}

async function datasetIdOf(client: PhoenixClient): Promise<string | null> {
  const response = await client.GET("/v1/datasets", {
    params: { query: { name: REFUSALS_DATASET } },
  });
  return datasetListSchema.parse(response.data)[0]?.id ?? null;
}

// Runs every case 5 times as a Phoenix experiment. Each run's worker spans go under its
// task's span in the experiment's trace. The description says what the commit changed.
export async function runRefusalsExperiment(
  phoenixUrl: string,
  given: WorkerRunGiven,
  description: string,
): Promise<void> {
  await runExperiment({
    client: createClient({ options: { baseUrl: phoenixUrl } }),
    experimentName: `candidate refusals ${given.commit.slice(0, 7)}`,
    experimentDescription: description,
    experimentMetadata: {
      commit: given.commit,
      stayResearcherModel: given.settings.stayResearcherModel,
      legScoutModel: given.settings.legScoutModel,
    },
    dataset: { datasetName: REFUSALS_DATASET },
    task: async (example) =>
      runOutputOf(
        await runRecordedWorker(
          given,
          refusalExampleInputSchema.parse(example.input),
        ),
      ),
    evaluators: [refusalRate, noRefusals],
    concurrency: CONCURRENCY,
    repetitions: REPETITIONS,
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

// The share of the run's candidate calls that were refused. Lower is better.
const refusalRate = asExperimentEvaluator({
  name: "refusal rate",
  kind: "CODE",
  evaluate: ({ output }) => {
    const { calls, refused } = refusalOutputSchema.parse(output);
    return {
      score: calls === 0 ? 0 : refused / calls,
      label: `${String(refused)} of ${String(calls)} refused`,
    };
  },
});

// Whether the run had no refused candidate call at all.
const noRefusals = asExperimentEvaluator({
  name: "no refusals",
  kind: "CODE",
  evaluate: ({ output }) => {
    const { refused } = refusalOutputSchema.parse(output);
    return {
      score: refused === 0 ? 1 : 0,
      label: refused === 0 ? "none refused" : "some refused",
    };
  },
});
