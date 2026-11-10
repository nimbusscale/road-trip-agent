import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@arizeai/phoenix-client";
import { getDatasetExamples } from "@arizeai/phoenix-client/datasets";
import {
  asExperimentEvaluator,
  getExperimentRuns,
  listExperiments,
  runExperiment,
} from "@arizeai/phoenix-client/experiments";

import { datasetIdOf } from "../grounded-eval/golden-dataset.js";

import {
  JUDGE_MODEL,
  localJudgePrompt,
  pushJudgePrompt,
} from "../grounded-eval/judge-prompt.js";
import { readRubric } from "../grounded-eval/labeling.js";
import {
  CONCURRENCY,
  type Judge,
  judgeFor,
  judgeOf,
  REPETITIONS,
} from "../grounded-eval/judge.js";
import { GOLDEN_DATASET } from "./golden-set.js";
import { RUBRIC_PATH } from "./label-files.js";
import { type JudgedTurn, reportOf, whereOf } from "./judge-report.js";
import { type JudgeDiff, judgeDiffsOf } from "./judge-score.js";
import {
  type SavingAnswer,
  savingAnswerSchema,
  type SavingCheck,
  savingCheckSchema,
} from "./saving-answer.schema.js";
import {
  goldenExampleSchema,
  goldenOutputSchema,
  type GoldenTurn,
} from "./saving-files.schema.js";
import { EVALS_DIR, SAVING_JUDGE } from "./saving-labeling.js";

// The judge's answers and reports, one folder for each rubric version it ran on.
const JUDGE_DIR = join(EVALS_DIR, "judge");

// The judge's actions for npm run saving (saving.ts), which lists what each does.
export const JUDGE_ACTIONS = {
  "push-prompt": pushSavingJudgePrompt,
  experiment: runExperimentAction,
  report: reportAction,
  "try-judge": tryJudgeAction,
};

// npm run saving -- push-prompt
async function pushSavingJudgePrompt(phoenixUrl: string): Promise<void> {
  const rubric = readRubric(RUBRIC_PATH);
  const pushed = await pushJudgePrompt(phoenixUrl, SAVING_JUDGE, rubric);
  const { promptName } = SAVING_JUDGE;
  console.log(
    pushed
      ? `Pushed rubric ${rubric.version} to ${promptName}.`
      : `${promptName} already has rubric ${rubric.version}.`,
  );
}

// npm run saving -- experiment [rubric commit]
function runExperimentAction(
  phoenixUrl: string,
  [version]: readonly string[],
): Promise<void> {
  const rubricVersion = version ?? readRubric(RUBRIC_PATH).version;
  return runSavingJudgeExperiment(
    phoenixUrl,
    rubricVersion,
    commitSubjectOf(rubricVersion),
  );
}

// npm run saving -- try-judge <rubric file> <runs> <set.item> [<set.item> ...]
function tryJudgeAction(
  phoenixUrl: string,
  [rubricPath, runs, ...items]: readonly string[],
): Promise<void> {
  const count = Number(runs);
  if (
    rubricPath === undefined ||
    !Number.isInteger(count) ||
    count < 1 ||
    items.length === 0
  ) {
    throw new Error(
      "Give a rubric file, a number of runs, and one or more set.item.",
    );
  }
  return tryJudge(phoenixUrl, rubricPath, count, items);
}

// The rubric commit's subject line, which says what that version changed.
function commitSubjectOf(version: string): string {
  return execFileSync("git", ["log", "-1", "--format=%s", version], {
    encoding: "utf8",
  }).trim();
}

// Runs the judge on every saving-golden turn, 3 times over, as a Phoenix experiment,
// with the prompt pushed for the rubric commit (#209). Phoenix scores each check on
// each run. The report, with each check's misses and false alarms over all runs, and
// each save the judge got wrong, goes in ~/tmp/road-trip-evals/saving/judge/.
async function runSavingJudgeExperiment(
  phoenixUrl: string,
  rubricVersion: string,
  description: string,
): Promise<void> {
  const { judge, promptVersionId } = await judgeFor(
    phoenixUrl,
    SAVING_JUDGE,
    rubricVersion,
  );
  const judged: JudgedTurn[] = [];
  let runsAsked = 0;
  // The report is written from the answers here even when Phoenix fails at the end,
  // after every run is saved. `report` rebuilds it from Phoenix.
  try {
    await runExperiment({
      client: createClient({ options: { baseUrl: phoenixUrl } }),
      experimentName: `rubric ${rubricVersion}`,
      experimentDescription: description,
      experimentMetadata: {
        rubric: rubricVersion,
        model: JUDGE_MODEL,
        promptVersionId,
      },
      dataset: { datasetName: GOLDEN_DATASET },
      task: async (example) => {
        runsAsked += 1;
        const run = await judgeTurn(judge, goldenExampleSchema.parse(example));
        judged.push(run);
        return run.answer;
      },
      evaluators: [
        ...savingCheckSchema.options.map(checkEvaluatorOf),
        turnMatches,
      ],
      concurrency: CONCURRENCY,
      repetitions: REPETITIONS,
    });
  } finally {
    writeRunFiles(
      rubricVersion,
      reportOf(`Rubric ${rubricVersion}: ${description}`, judged, runsAsked),
      judged,
    );
  }
}

// npm run saving -- report [rubric commit]
// Rebuilds the report from the latest experiment on the rubric commit, from the
// answers Phoenix saved, scored against the golden set's labels as they are now.
async function reportAction(
  phoenixUrl: string,
  [version]: readonly string[],
): Promise<void> {
  const rubricVersion = version ?? readRubric(RUBRIC_PATH).version;
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const datasetId = await datasetIdOf(client, GOLDEN_DATASET);
  const experiment = (
    await listExperiments({ client, datasetId: datasetId ?? "" })
  )
    .filter((e) => e.metadata.rubric === rubricVersion)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (experiment === undefined) {
    throw new Error(`${GOLDEN_DATASET} has no experiment on ${rubricVersion}.`);
  }
  const turns = new Map(
    (
      await getDatasetExamples({
        client,
        dataset: { datasetId: experiment.datasetId },
      })
    ).examples.map((example) => [
      example.id,
      goldenExampleSchema.parse(example),
    ]),
  );
  const { runs } = await getExperimentRuns({
    client,
    experimentId: experiment.id,
  });
  const judged = runs.flatMap((run): JudgedTurn[] => {
    const turn = turns.get(run.datasetExampleId);
    if (turn === undefined || run.error !== null) {
      return [];
    }
    const answer = savingAnswerSchema.parse(run.output);
    return [{ turn, answer, diffs: judgeDiffsOf(turn.expected, answer) }];
  });
  writeRunFiles(
    rubricVersion,
    reportOf(
      `Rubric ${rubricVersion}: ${commitSubjectOf(rubricVersion)}`,
      judged,
      runs.length,
    ),
    judged,
  );
}

function writeRunFiles(
  rubricVersion: string,
  report: string,
  judged: readonly JudgedTurn[],
): void {
  console.log(report);
  const dir = join(JUDGE_DIR, `rubric-${rubricVersion}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "report.md"), report);
  const answers = judged.map(({ turn, answer }) => ({
    set: turn.set,
    item: turn.item,
    spanId: turn.spanId,
    answer,
  }));
  writeFileSync(
    join(dir, "answers.json"),
    `${JSON.stringify(answers, null, 2)}\n`,
  );
  console.log(`Wrote the report and the answers to ${dir}.`);
}

// Runs the judge on a few golden turns, given as set.item such as 4.2, with a rubric
// file as it is on disk, committed or not. It's for trying a rubric change on the
// turns it's meant to fix before a full run. Nothing is saved in Phoenix.
async function tryJudge(
  phoenixUrl: string,
  rubricPath: string,
  runs: number,
  items: readonly string[],
): Promise<void> {
  const turns = (await readGoldenTurns(phoenixUrl)).filter((turn) =>
    items.includes(`${String(turn.set)}.${String(turn.item)}`),
  );
  if (turns.length !== items.length) {
    throw new Error(
      `Found ${String(turns.length)} of the ${String(items.length)} turns in ${GOLDEN_DATASET}. Give each as set.item, such as 4.2.`,
    );
  }
  const judge = judgeOf(
    SAVING_JUDGE,
    localJudgePrompt(SAVING_JUDGE, readFileSync(rubricPath, "utf8")),
  );
  const tasks = turns.flatMap((turn) =>
    Array.from({ length: runs }, () => turn),
  );
  const judged: JudgedTurn[] = [];
  await inPool(tasks, async (turn) => {
    try {
      judged.push(await judgeTurn(judge, turn));
    } catch (error) {
      console.log(`${whereOf(turn)}: no answer, ${String(error)}`);
    }
  });
  console.log(reportOf(`${rubricPath} on disk`, judged, tasks.length));
}

async function judgeTurn(
  judge: Judge<SavingAnswer>,
  turn: GoldenTurn,
): Promise<JudgedTurn> {
  const answer = await judge(turn.labelerInput);
  return { turn, answer, diffs: judgeDiffsOf(turn.expected, answer) };
}

async function readGoldenTurns(phoenixUrl: string): Promise<GoldenTurn[]> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const { examples } = await getDatasetExamples({
    client,
    dataset: { datasetName: GOLDEN_DATASET },
  });
  return examples.map((example) => goldenExampleSchema.parse(example));
}

// Phoenix's score for one check on one run: 1 when the judge matches every save's
// label on that check. Its label counts the misses and false alarms.
function checkEvaluatorOf(
  check: SavingCheck,
): ReturnType<typeof asExperimentEvaluator> {
  return asExperimentEvaluator({
    name: check,
    kind: "CODE",
    evaluate: ({ output, expected }) => {
      const diffs = diffsOf(output, expected).filter((d) => d.check === check);
      const misses = diffs.filter((d) => d.kind === "miss").length;
      return {
        score: diffs.length === 0 ? 1 : 0,
        label: `${String(misses)} missed, ${String(diffs.length - misses)} false alarms`,
      };
    },
  });
}

const turnMatches = asExperimentEvaluator({
  name: "turn matches",
  kind: "CODE",
  evaluate: ({ output, expected }) => {
    const diffs = diffsOf(output, expected);
    return {
      score: diffs.length === 0 ? 1 : 0,
      label: `${String(diffs.length)} differences`,
    };
  },
});

function diffsOf(output: unknown, expected: unknown): JudgeDiff[] {
  const { saves } = goldenOutputSchema.parse(expected);
  return judgeDiffsOf(saves, savingAnswerSchema.parse(output));
}

async function inPool<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) {
        await run(item);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
