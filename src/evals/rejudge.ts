// Spike (#132): runs the judge again on an experiment's saved conversations, so the
// judge's own spread can be told apart from the coordinator's. The coordinator doesn't
// run. Each pass adds a judge annotation to every run in Phoenix.
//
// npm run eval:rejudge -- --experiment <experiment ID> --times 3
import { parseArgs } from "node:util";

import { createClient } from "@arizeai/phoenix-client";
import {
  evaluateExperiment,
  getExperiment,
} from "@arizeai/phoenix-client/experiments";

import { parseEnv } from "../config/env.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { memoryAccessFor } from "../tools/memory-server.js";
import { PHOENIX_URL } from "../tracing.js";
import { verdictSchema } from "./memory-eval.schema.js";
import { judgeScorer } from "./memory-scorers.js";

const { values } = parseArgs({
  options: {
    experiment: { type: "string" },
    times: { type: "string", default: "3" },
  },
});
if (values.experiment === undefined) {
  throw new Error("Give the experiment ID with --experiment.");
}
const env = parseEnv(process.env);
const pool = createPool(env);
const client = createClient({ options: { baseUrl: PHOENIX_URL } });
const reader = memoryAccessFor({
  pool,
  settings: loadSettings(SETTINGS_PATH),
}).reader;
try {
  const experiment = await getExperiment({
    client,
    experimentId: values.experiment,
  });
  const results: Record<string, (number | null | undefined)[]> = {};
  for (let pass = 0; pass < Number(values.times); pass++) {
    const evaluated = await evaluateExperiment({
      client,
      experiment,
      evaluators: [judgeScorer(reader, process.env.JUDGE_API_KEY)],
      concurrency: 1,
    });
    for (const evaluation of evaluated.evaluationRuns ?? []) {
      const parsed = verdictSchema.shape.criteria.safeParse(
        evaluation.result?.metadata?.criteria,
      );
      const failed = parsed.success ? parsed.data : [];
      (results[evaluation.experimentRunId] ??= []).push(
        evaluation.result?.score,
      );
      console.log(
        evaluation.experimentRunId,
        pass,
        evaluation.result?.score,
        failed
          .filter((criterion) => !criterion.passed)
          .map((criterion) => criterion.name)
          .join(","),
      );
    }
  }
  console.log(JSON.stringify(results));
} finally {
  await pool.end();
}
