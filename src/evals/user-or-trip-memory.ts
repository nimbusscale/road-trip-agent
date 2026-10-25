// Spike (#132): the "user or trip memory" case (#48), as a Phoenix experiment.
//
// docker compose --profile evals up -d phoenix
// npm run eval:memory                      one run
// npm run eval:memory -- --repetitions 5   five runs of the case
import { parseArgs } from "node:util";

import { createClient } from "@arizeai/phoenix-client";
import { createDataset } from "@arizeai/phoenix-client/datasets";
import { runExperiment } from "@arizeai/phoenix-client/experiments";

import { coordinatorAccessFor } from "../agent/coordinator-access.js";
import { parseEnv } from "../config/env.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { PHOENIX_URL } from "../tracing.js";
import {
  type ExpectedItem,
  JUDGE_MODEL,
  judgeScorer,
  savedScopeScorer,
} from "./memory-scorers.js";
import { checkPlanToken } from "./plan-check.js";
import { runScriptedConversation } from "./scripted-conversation.js";
import { conversationRecordSchema } from "./memory-eval.schema.js";

const DATASET_NAME = "user-or-trip-memory";

const USER_MEMORY = ["Usually drives up to 6 hours a day."];
const MESSAGES = [
  "Hi! We're planning a road trip from Austin to Santa Fe in April, about 6 days.",
  "One thing about us: we never eat at chains.",
  "Also, skip I-35 this time.",
];
const EXPECTED: ExpectedItem[] = [
  { statement: "we never eat at chains", memory: "user", pattern: "chain" },
  { statement: "skip I-35 this time", memory: "trip", pattern: "I-?35" },
];

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { repetitions: { type: "string", default: "1" } },
  });
  const repetitions = Number(values.repetitions);
  const env = parseEnv(process.env);
  const settings = loadSettings(SETTINGS_PATH);
  const pool = createPool(env);
  try {
    const coordinator = coordinatorAccessFor({
      env,
      pool,
      settings,
      processEnv: process.env,
    });
    const plan = await checkPlanToken(
      coordinator.processEnv,
      settings.coordinatorModel,
    );
    console.log("Plan check:", JSON.stringify(plan));

    const client = createClient({ options: { baseUrl: PHOENIX_URL } });
    const { datasetId } = await createDataset({
      client,
      name: DATASET_NAME,
      description:
        "Technical spec 3.1, user or trip: each statement is saved to user memory, trip memory, or neither (#48).",
      examples: [
        {
          input: { userMemory: USER_MEMORY, messages: MESSAGES },
          output: { items: EXPECTED },
          metadata: { from: "#48" },
        },
      ],
    });
    const experiment = await runExperiment({
      client,
      dataset: { datasetId },
      experimentName: `user-or-trip-memory ${new Date().toISOString()}`,
      experimentMetadata: {
        coordinatorModel: settings.coordinatorModel,
        judgeModel: JUDGE_MODEL,
      },
      repetitions,
      // One conversation at a time, so each run's use of the plan can be told apart.
      concurrency: 1,
      task: (example) =>
        runScriptedConversation({
          coordinator,
          pool,
          userMemory: USER_MEMORY,
          messages: conversationInput(example.input),
        }),
      evaluators: [
        savedScopeScorer(coordinator.memory.reader),
        judgeScorer(coordinator.memory.reader, process.env.JUDGE_API_KEY),
      ],
    });
    printSummary(experiment);
  } finally {
    await pool.end();
  }
}

function conversationInput(input: Record<string, unknown>): string[] {
  const { messages } = input;
  if (
    !Array.isArray(messages) ||
    !messages.every((m) => typeof m === "string")
  ) {
    throw new Error("The example's input has no messages.");
  }
  return messages;
}

type Experiment = Awaited<ReturnType<typeof runExperiment>>;

// Each run's scores, the coordinator's tokens per turn, and the judge's tokens. Phoenix
// shows each run's price, worked out from the model call spans' tokens.
function printSummary(experiment: Experiment): void {
  const runs = Object.values(experiment.runs);
  const summary = runs.map((run) => {
    const record = conversationRecordSchema.parse(run.output);
    const evaluations = (experiment.evaluationRuns ?? []).filter(
      (evaluation) => evaluation.experimentRunId === run.id,
    );
    return {
      run: run.id,
      traceId: run.traceId,
      error: run.error,
      userId: record.userId,
      tripId: record.tripId,
      turns: record.turns.map((turn) => ({
        seconds: Math.round(turn.durationMs / 1000),
        failure: turn.failure,
        toolCalls: turn.toolCalls.map((call) => call.name),
        usage: turn.usage,
      })),
      scores: evaluations.map((evaluation) => ({
        name: evaluation.name,
        error: evaluation.error,
        ...evaluation.result,
      })),
    };
  });
  console.log(
    JSON.stringify({ experimentId: experiment.id, runs: summary }, null, 2),
  );
}

await main();
