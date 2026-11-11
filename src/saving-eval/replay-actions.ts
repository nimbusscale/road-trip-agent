import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@arizeai/phoenix-client";
import { getDatasetExamples } from "@arizeai/phoenix-client/datasets";
import {
  getExperimentRuns,
  listExperiments,
} from "@arizeai/phoenix-client/experiments";
import type { ExperimentInfo } from "@arizeai/phoenix-client/types/experiments";
import { Pool } from "pg";

import { parseEnv } from "../config/env.js";
import type { Env } from "../config/env.schema.js";
import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { datasetIdOf } from "../grounded-eval/golden-dataset.js";
import { JUDGE_MODEL } from "../grounded-eval/judge-prompt.js";
import { judgeFor } from "../grounded-eval/judge.js";
import { readRubric } from "../grounded-eval/labeling.js";
import { appCommit } from "../tracing/app-commit.js";
import { startTracing } from "../tracing/phoenix.js";
import { RUBRIC_PATH } from "./label-files.js";
import {
  REPLAY_DATASET,
  saveReplayDataset,
  saveReplaySplit,
  splitCasesOf,
} from "./replay-cases.js";
import {
  type ReplayExperiment,
  type ReplayGiven,
  type ReplayResume,
  resumeReplayExperiment,
  runReplayExperiment,
} from "./replay-experiment.js";
import {
  type ReplayCaseRuns,
  replayReportOf,
  replayScoreOf,
} from "./replay-score.js";
import {
  replayExperimentMetadataSchema,
  replayExpectedSchema,
  replayMetadataSchema,
  type ReplayOutput,
  replayOutputSchema,
} from "./replay.schema.js";
import { EVALS_DIR, SAVING_JUDGE } from "./saving-labeling.js";

type PhoenixClient = ReturnType<typeof createClient>;

// The replays' reports, one folder for each experiment.
const REPLAYS_DIR = join(EVALS_DIR, "replays");

// The replays' actions for npm run saving (saving.ts), which lists what each does.
export const REPLAY_ACTIONS = {
  "replay-dataset": saveReplayDataset,
  "replay-split": saveReplaySplit,
  replay: replayAction,
  "replay-resume": resumeAction,
  "replay-report": reportAction,
};

// npm run saving -- replay-report [experiment ID [split]]
function reportAction(
  phoenixUrl: string,
  [experimentId, split]: readonly string[],
): Promise<void> {
  return writeReplayReport(phoenixUrl, experimentId ?? null, split ?? null);
}

// npm run saving -- replay <trial set or all> <runs per case>
async function replayAction(
  phoenixUrl: string,
  [set, runs]: readonly string[],
): Promise<void> {
  const runsPerCase = Number(runs);
  if (set === undefined || !Number.isInteger(runsPerCase) || runsPerCase < 1) {
    throw new Error(
      "Give a trial set, such as trial-1, or all, then the runs per case.",
    );
  }
  const split = set === "all" ? null : set;
  await withReplayGiven(phoenixUrl, split, async (given, experiment) => {
    await runReplayExperiment(given, { ...experiment, split, runsPerCase });
  });
}

// npm run saving -- replay-resume <experiment ID> <split or all> [most runs]
async function resumeAction(
  phoenixUrl: string,
  [experimentId, set, most]: readonly string[],
): Promise<void> {
  const mostRuns = most === undefined ? null : Number(most);
  if (
    experimentId === undefined ||
    set === undefined ||
    (mostRuns !== null && (!Number.isInteger(mostRuns) || mostRuns < 1))
  ) {
    throw new Error(
      "Give the experiment's ID, a split or all, and optionally the most runs to run.",
    );
  }
  const split = set === "all" ? null : set;
  const resume: ReplayResume = {
    cases: split === null ? null : await splitCasesOf(phoenixUrl, split),
    mostRuns,
  };
  await withReplayGiven(phoenixUrl, split, async (given) => {
    await resumeReplayExperiment(given, experimentId, resume);
  });
}

// Sets up what a run needs, runs it, and then writes the report from Phoenix. Every
// full judge run lost its Phoenix connection at its very end, after its runs were saved
// (#209), so the report is built from what Phoenix saved, and `replay-report` can build
// it again.
async function withReplayGiven(
  phoenixUrl: string,
  split: string | null,
  run: (
    given: ReplayGiven,
    experiment: Omit<ReplayExperiment, "split" | "runsPerCase">,
  ) => Promise<void>,
): Promise<void> {
  const env = parseEnv(process.env);
  const commit = cleanCommit(env);
  const settings = loadSettings(SETTINGS_PATH);
  const rubricVersion = readRubric(RUBRIC_PATH).version;
  const { judge, promptVersionId } = await judgeFor(
    phoenixUrl,
    SAVING_JUDGE,
    rubricVersion,
  );
  const localPool = createPool(env);
  const livePool = new Pool(livePoolConfigOf(process.env));
  const tracing = startTracing(env);
  const description = commitSubjectOf("HEAD");
  const turnRun = {
    ...{ env, settings, processEnv: process.env },
    ...{ localPool, livePool, commit },
  };
  try {
    await run(
      { turnRun, phoenixUrl, projectName: env.phoenixProject, tracing, judge },
      {
        description,
        metadata: {
          ...{ commit, description, rubric: rubricVersion, promptVersionId },
          judgeModel: JUDGE_MODEL,
          coordinatorModel: settings.coordinatorModel,
          coordinatorEffort: settings.coordinatorEffort,
        },
      },
    );
  } finally {
    await Promise.all([localPool.end(), livePool.end()]);
    await tracing.shutdown();
    await writeReplayReport(phoenixUrl, null, split).catch((error: unknown) => {
      console.error(
        `The report wasn't written: ${String(error)}. Run replay-report to write it.`,
      );
    });
  }
}

// The experiment is named for the commit, so the code that runs has to be that
// commit's.
function cleanCommit(env: Env): string {
  const commit = appCommit(env.appCommit);
  if (commit.endsWith("-dirty")) {
    throw new Error(
      "Commit the change first, so the experiment is named for the code that runs.",
    );
  }
  return commit;
}

function commitSubjectOf(commit: string): string {
  return execFileSync("git", ["log", "-1", "--format=%s", commit], {
    encoding: "utf8",
  }).trim();
}

// npm run saving -- replay-report [experiment ID [split]]
// Writes the report for the experiment, or the latest one on saving-replays, from what
// Phoenix saved: the report, each failure the judge found, and every run's output. With
// a split, it counts only the split's cases.
export async function writeReplayReport(
  phoenixUrl: string,
  experimentId: string | null,
  split: string | null,
): Promise<void> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const experiment = await experimentOf(client, experimentId);
  const { examples } = await getDatasetExamples({
    client,
    dataset: {
      datasetId: experiment.datasetId,
      ...(split === null ? {} : { splits: [split] }),
    },
  });
  const { runs } = await getExperimentRuns({
    client,
    experimentId: experiment.id,
  });
  const cases = new Map(
    examples.map((example) => [example.id, caseOf(example)]),
  );
  for (const run of runs) {
    cases.get(run.datasetExampleId)?.add(run);
  }
  const title = `${titleOf(experiment.id, experiment.metadata)}${split === null ? "" : `, counting only split ${split}`}`;
  const dir = join(REPLAYS_DIR, experiment.id, split ?? "");
  mkdirSync(dir, { recursive: true });
  const ran = [...cases.values()].filter((c) => c.runs.runs.length > 0);
  const report = replayReportOf(
    title,
    ran.map((c) => c.runs),
  );
  writeFileSync(join(dir, "report.md"), report);
  writeFileSync(join(dir, "failures.md"), failuresOf(title, ran));
  writeFileSync(
    join(dir, "runs.json"),
    `${JSON.stringify(
      ran.map((c) => c.outputs),
      null,
      2,
    )}\n`,
  );
  console.log(report);
  console.log(`Wrote the report, the failures, and the runs to ${dir}.`);
}

async function experimentOf(
  client: PhoenixClient,
  experimentId: string | null,
): Promise<ExperimentInfo> {
  const datasetId = await datasetIdOf(client, REPLAY_DATASET);
  const experiment = (
    await listExperiments({ client, datasetId: datasetId ?? "" })
  )
    .filter((e) => experimentId === null || e.id === experimentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (experiment === undefined) {
    throw new Error(
      `${REPLAY_DATASET} has no experiment ${experimentId ?? ""}.`,
    );
  }
  return experiment;
}

function titleOf(experimentId: string, metadata: unknown): string {
  const { commit, description, split, runsPerCase, rubric } =
    replayExperimentMetadataSchema.parse(metadata);
  return `Experiment ${experimentId}, ${split} cases ${String(runsPerCase)} times, on ${commit.slice(0, 7)} (${description}), judged on rubric ${rubric}`;
}

interface CaseRuns {
  runs: ReplayCaseRuns;
  outputs: ({ error: string } | ReplayOutput)[];
  add: (run: { output?: unknown; error: string | null }) => void;
}

function caseOf(example: { output?: unknown; metadata?: unknown }): CaseRuns {
  const { set, item } = replayMetadataSchema.parse(example.metadata);
  const { originalChecks } = replayExpectedSchema.parse(example.output);
  const runs: ReplayCaseRuns = { set, item, originalChecks, runs: [] };
  const outputs: CaseRuns["outputs"] = [];
  return {
    runs,
    outputs,
    add: ({ output, error }) => {
      if (error !== null) {
        runs.runs.push({ error });
        outputs.push({ error });
        return;
      }
      const parsed = replayOutputSchema.parse(output);
      runs.runs.push({ score: replayScoreOf(parsed.answer) });
      outputs.push(parsed);
    },
  };
}

// Each failure the judge found, case by case and run by run, with its quote and why.
function failuresOf(title: string, cases: readonly CaseRuns[]): string {
  const lines = [`# Failures: ${title}`, ""];
  const sorted = [...cases].sort(
    (a, b) => a.runs.set - b.runs.set || a.runs.item - b.runs.item,
  );
  for (const c of sorted) {
    lines.push(
      `## ${String(c.runs.set)}.${String(c.runs.item)}, golden turn failed ${c.runs.originalChecks.join(", ")}`,
      "",
    );
    for (const [index, output] of c.outputs.entries()) {
      lines.push(...runLines(index + 1, output));
    }
    lines.push("");
  }
  return lines.join("\n");
}

function runLines(
  number: number,
  output: CaseRuns["outputs"][number],
): string[] {
  const head = `- Run ${String(number)}`;
  if ("error" in output) {
    return [`${head}: failed, ${output.error}`];
  }
  const saves = output.saveTools.join(", ");
  const failures = output.answer.saves.flatMap((save) =>
    save.failures.map(
      (f) =>
        `  - Save ${String(save.n)} (${output.saveTools[save.n - 1] ?? "?"}), ${f.check}: "${f.quote}": ${f.why}`,
    ),
  );
  return [
    `${head} (span ${output.spanId}): ${saves === "" ? "saved nothing" : `saves ${saves}`}${failures.length === 0 ? ", passes" : ""}`,
    ...failures,
  ];
}
