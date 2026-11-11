import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "@arizeai/phoenix-client";
import {
  asExperimentEvaluator,
  resumeExperiment,
  runExperiment,
} from "@arizeai/phoenix-client/experiments";
import { context, ROOT_CONTEXT } from "@opentelemetry/api";

import { traceTurnOf } from "../grounded-eval/corpus-reader.js";
import type { CorpusTurn } from "../grounded-eval/corpus-turn.js";
import type { Judge } from "../grounded-eval/judge.js";
import type { TracerProvider } from "../tracing/phoenix.js";
import { runRecordedTurn, type TurnRunGiven } from "../turn-run/turn-run.js";
import { savesIn, turnInputOf } from "./labeler-input.js";
import { REPLAY_DATASET } from "./replay-cases.js";
import {
  passes,
  passesChecks,
  replayScoreOf,
  savedNothing,
} from "./replay-score.js";
import {
  type ReplayInput,
  type ReplayOutput,
  replayExpectedSchema,
  replayInputSchema,
  replayOutputSchema,
} from "./replay.schema.js";
import {
  answerFitsSaves,
  type SavingAnswer,
  type SavingCheck,
  savingCheckSchema,
} from "./saving-answer.schema.js";

// The saving replays (#209, "How a case runs, and what the judge reads"). Each run
// starts a turn from the case's recorded session with run-turn's code, on today's
// instructions, and the coordinator makes its own calls. The judge reads the case's
// <before> and <earlier_turns>, and a <turn> built from the run's trace in Phoenix,
// with the same code that builds the golden turns' <turn>.

// Three turns at a time keeps the runs inside the Claude plan's limits, as the
// candidate refusals evaluation does. Each one is a Claude Code process, and may start
// workers.
const CONCURRENCY = 3;

// A judge answer that skips a save, or numbers them wrong, is asked again this many
// times in all, before the run fails.
const JUDGE_TRIES = 3;

// Phoenix saves spans a moment after they arrive, so the run's trace is read until its
// turn span is there.
const TRACE_TRIES = 30;
const TRACE_WAIT_MILLISECONDS = 2000;

export interface ReplayGiven {
  turnRun: TurnRunGiven;
  phoenixUrl: string;
  // The project the run's traces go to, road-trip-agent-local.
  projectName: string;
  // The app's own tracing, so the run's turn goes to that project, as a run-turn turn's
  // does, and not into the experiment's trace.
  tracing: TracerProvider;
  judge: Judge<SavingAnswer>;
}

export interface ReplayExperiment {
  // A trial split, such as trial-1, or null for every case.
  split: string | null;
  runsPerCase: number;
  description: string;
  metadata: Record<string, unknown>;
}

export async function runReplayExperiment(
  given: ReplayGiven,
  experiment: ReplayExperiment,
): Promise<void> {
  const { split, runsPerCase } = experiment;
  await runExperiment({
    client: createClient({ options: { baseUrl: given.phoenixUrl } }),
    experimentName: `saving replays ${split ?? "all"} ${given.turnRun.commit.slice(0, 7)}`,
    experimentDescription: experiment.description,
    experimentMetadata: {
      ...experiment.metadata,
      split: split ?? "all",
      runsPerCase,
    },
    dataset: {
      datasetName: REPLAY_DATASET,
      ...(split === null ? {} : { splits: [split] }),
    },
    task: (example) =>
      replayRunOf(given, replayInputSchema.parse(example.input)),
    evaluators: EVALUATORS,
    concurrency: CONCURRENCY,
    repetitions: runsPerCase,
    setGlobalTracerProvider: false,
  });
}

// Runs again the runs of an experiment that failed, or never ran. With a most, the
// runs past it fail at once without running a turn, so they stay failed for the next
// resume.
export async function resumeReplayExperiment(
  given: ReplayGiven,
  experimentId: string,
  mostRuns: number | null,
): Promise<void> {
  let started = 0;
  await resumeExperiment({
    client: createClient({ options: { baseUrl: given.phoenixUrl } }),
    experimentId,
    task: async (example) => {
      if (mostRuns !== null && started >= mostRuns) {
        throw new Error(
          `Not run: this resume ran at most ${String(mostRuns)} runs.`,
        );
      }
      started += 1;
      return replayRunOf(given, replayInputSchema.parse(example.input));
    },
    evaluators: EVALUATORS,
    concurrency: CONCURRENCY,
    setGlobalTracerProvider: false,
  });
}

// One run of a case. A turn that failed, such as on the Claude plan's limit, fails the
// task, so Phoenix shows it as an error, and its evaluators give it no score. Its saves
// would be judged as a run that saved less.
async function replayRunOf(
  given: ReplayGiven,
  input: ReplayInput,
): Promise<ReplayOutput> {
  // A root context, so the turn is its own trace, as a run-turn turn is.
  const run = await context.with(ROOT_CONTEXT, () =>
    runRecordedTurn(
      given.turnRun,
      { agentSessionId: input.agentSessionId, turn: input.turn, message: null },
      () => undefined,
    ),
  );
  if (run.failure !== null || run.spanId === null) {
    throw new Error(
      `The turn failed: ${run.failure ?? "no span"} (span ${run.spanId ?? "none"}, trip ${run.tripId}).`,
    );
  }
  await given.tracing.forceFlush();
  const turn = await tracedTurnOf(given, run.spanId);
  const saves = savesIn(turn);
  const turnInput = turnInputOf(turn);
  const answer =
    saves.length === 0
      ? { saves: [] }
      : await judged(
          given.judge,
          `${input.judgeContext}\n\n${turnInput}`,
          saves.length,
        );
  return {
    spanId: run.spanId,
    tripId: run.tripId,
    userId: run.userId,
    saveTools: saves.map((save) => save.tool),
    turnInput,
    answer,
  };
}

async function tracedTurnOf(
  given: ReplayGiven,
  spanId: string,
): Promise<CorpusTurn> {
  for (let tries = 0; tries < TRACE_TRIES; tries++) {
    await sleep(TRACE_WAIT_MILLISECONDS);
    const turn = await traceTurnOf(given.phoenixUrl, given.projectName, spanId);
    if (turn !== null) {
      // Read once more, in case the turn's span was saved before the spans under it.
      await sleep(TRACE_WAIT_MILLISECONDS);
      return (
        (await traceTurnOf(given.phoenixUrl, given.projectName, spanId)) ?? turn
      );
    }
  }
  throw new Error(
    `Phoenix doesn't have the turn's span ${spanId} in ${given.projectName}.`,
  );
}

async function judged(
  judge: Judge<SavingAnswer>,
  judgeInput: string,
  saveCount: number,
): Promise<SavingAnswer> {
  for (let tries = 0; tries < JUDGE_TRIES; tries++) {
    const answer = await judge(judgeInput);
    if (answerFitsSaves(answer, saveCount)) {
      return answer;
    }
  }
  throw new Error(
    `The judge's answer didn't have one entry for each of the ${String(saveCount)} saves, ${String(JUDGE_TRIES)} times.`,
  );
}

function scoreOf(output: unknown) {
  return replayScoreOf(replayOutputSchema.parse(output).answer);
}

const passed = asExperimentEvaluator({
  name: "passes",
  kind: "CODE",
  evaluate: ({ output }) => {
    const score = scoreOf(output);
    return {
      score: passes(score) ? 1 : 0,
      label: passes(score) ? "passes" : `fails ${score.failing.join(", ")}`,
    };
  },
});

const passedOriginal = asExperimentEvaluator({
  name: "passes its golden checks",
  kind: "CODE",
  evaluate: ({ output, expected }) => {
    const { originalChecks } = replayExpectedSchema.parse(expected);
    const ok = passesChecks(scoreOf(output), originalChecks);
    return {
      score: ok ? 1 : 0,
      label: `${ok ? "passes" : "fails"} ${originalChecks.join(", ")}`,
    };
  },
});

const nothingSaved = asExperimentEvaluator({
  name: "saved nothing",
  kind: "CODE",
  evaluate: ({ output }) => {
    const score = scoreOf(output);
    return {
      score: savedNothing(score) ? 1 : 0,
      label: `${String(score.saves)} saves`,
    };
  },
});

function checkEvaluatorOf(
  check: SavingCheck,
): ReturnType<typeof asExperimentEvaluator> {
  return asExperimentEvaluator({
    name: `${check} passes`,
    kind: "CODE",
    evaluate: ({ output }) => {
      const ok = !scoreOf(output).failing.includes(check);
      return { score: ok ? 1 : 0, label: ok ? "passes" : "fails" };
    },
  });
}

const EVALUATORS = [
  passed,
  passedOriginal,
  nothingSaved,
  ...savingCheckSchema.options.map(checkEvaluatorOf),
];
