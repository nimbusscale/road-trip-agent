import { createClient } from "@arizeai/phoenix-client";
import {
  createDataset,
  createDatasetSplit,
  getDatasetExamples,
} from "@arizeai/phoenix-client/datasets";
import { Pool } from "pg";

import { livePoolConfigOf } from "../config/live-env.schema.js";
import { readCorpus } from "../grounded-eval/corpus-reader.js";
import { datasetIdOf } from "../grounded-eval/golden-dataset.js";
import { readTurnsFile } from "./label-files.js";
import { labelerContextOf } from "./labeler-input.js";
import type { ReviewItem } from "./review-page.js";
import { reviewItemsOf } from "./review-items.js";
import { savingCheckSchema } from "./saving-answer.schema.js";
import type { GoldenTurn } from "./saving-files.schema.js";
import { readGoldenTurns } from "./saving-judge.js";
import { caseNameOf, type ReplayInput } from "./replay.schema.js";

// The saving replays' cases (#209, "The cases, and how many runs"): every saving-golden
// turn that fails a check. Nothing outside the golden set is a case.

export const REPLAY_DATASET = "saving-replays";

// A trial runs a few cases once each, to check the setup before the baseline. Its
// cases are the first of each of the first few sessions, by set and item, so the
// trial covers different trips.
export const TRIAL_SPLIT = "trial-1";
const TRIAL_SIZE = 3;

export interface ReplayExample {
  input: ReplayInput;
  output: { originalChecks: string[] };
  metadata: { set: number; item: number; sessionId: string };
  splits: string[];
}

// npm run saving -- replay-dataset (saving.ts). It saves the dataset once. The cases
// come from the golden set's labels as they are now, so a later label change doesn't
// change them, and a new set of cases would go in as a new version of the dataset, not
// by deleting it, since that deletes its experiments (DEVELOPMENT.md section 5).
export async function saveReplayDataset(phoenixUrl: string): Promise<void> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  if ((await datasetIdOf(client, REPLAY_DATASET)) !== null) {
    console.log(
      `${REPLAY_DATASET} is already in Phoenix, so nothing was saved.`,
    );
    return;
  }
  const failing = (await readGoldenTurns(phoenixUrl))
    .filter((turn) => turn.expected.some((save) => save.checks.length > 0))
    .sort((a, b) => a.set - b.set || a.item - b.item);
  const items = await reviewItemsFor(phoenixUrl, failing);
  const examples = withTrialSplit(
    failing.map((golden, index) => {
      const item = items[index];
      if (item === undefined) {
        throw new Error(`Turn ${golden.spanId} has no review item.`);
      }
      return replayExampleOf(golden, item);
    }),
  );
  await createDataset({
    client,
    name: REPLAY_DATASET,
    description:
      "The saving replays (#209): each saving-golden turn that fails a check, run again on today's code.",
    examples,
  });
  console.log(`Saved ${String(examples.length)} cases as ${REPLAY_DATASET}.`);
}

// npm run saving -- replay-split <split> <case to leave out> ... (saving.ts). Saves a
// split of every case but the ones named, such as 8.3, by set and item. It's how the
// cases whose turn starts many workers are left out of a run (#209), since one of them
// uses as much of the Claude plan's limit as dozens of other turns.
export async function saveReplaySplit(
  phoenixUrl: string,
  [split, ...leftOut]: readonly string[],
): Promise<void> {
  if (split === undefined) {
    throw new Error("Give the split's name, then the cases to leave out.");
  }
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const { examples } = await getDatasetExamples({
    client,
    dataset: { datasetName: REPLAY_DATASET },
  });
  const named = examples.map((example) => ({
    id: example.id,
    name: caseNameOf(example.metadata),
  }));
  const unknown = leftOut.filter((c) => !named.some((n) => n.name === c));
  if (unknown.length > 0) {
    throw new Error(`${REPLAY_DATASET} has no case ${unknown.join(", ")}.`);
  }
  const kept = named.filter((n) => !leftOut.includes(n.name));
  await createDatasetSplit({
    client,
    dataset: { datasetName: REPLAY_DATASET },
    name: split,
    description: `Every case but ${leftOut.join(", ")}.`,
    exampleIds: kept.map((n) => n.id),
  });
  console.log(
    `Saved split ${split}: ${String(kept.length)} cases, leaving out ${leftOut.join(", ")}.`,
  );
}

export // The cases in a split, by set and item.
async function splitCasesOf(
  phoenixUrl: string,
  split: string,
): Promise<Set<string>> {
  const { examples } = await getDatasetExamples({
    client: createClient({ options: { baseUrl: phoenixUrl } }),
    dataset: { datasetName: REPLAY_DATASET, splits: [split] },
  });
  if (examples.length === 0) {
    throw new Error(`${REPLAY_DATASET} has no split ${split}.`);
  }
  return new Set(examples.map((example) => caseNameOf(example.metadata)));
}

async function reviewItemsFor(
  phoenixUrl: string,
  golden: readonly GoldenTurn[],
): Promise<ReviewItem[]> {
  const sessionOf = new Map(
    readTurnsFile().turns.map((turn) => [turn.spanId, turn.sessionId]),
  );
  const saveTurns = golden.map((turn) => ({
    set: turn.set,
    spanId: turn.spanId,
    sessionId: sessionOf.get(turn.spanId) ?? "",
  }));
  const sessions = new Map(
    (await readCorpus(phoenixUrl)).map((s) => [s.sessionId, s]),
  );
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    return await reviewItemsOf(saveTurns, sessions, livePool);
  } finally {
    await livePool.end();
  }
}

// A case from its golden turn. Its judge context is built again from the live data, as
// the golden turn's labeler input was, and checked against it, so a run is judged on
// the same <before> and <earlier_turns> as its golden turn.
export function replayExampleOf(
  golden: GoldenTurn,
  item: ReviewItem,
): ReplayExample {
  const judgeContext = labelerContextOf(
    item.session,
    golden.spanId,
    item.before,
  );
  if (!golden.labelerInput.startsWith(`${judgeContext}\n\n<turn>\n`)) {
    throw new Error(
      `Set ${String(golden.set)} item ${String(golden.item)}: the trip or conversation before the turn isn't what its golden input shows.`,
    );
  }
  return {
    input: {
      goldenSpanId: golden.spanId,
      agentSessionId: item.turn.sessionId,
      turn: item.before.turn,
      judgeContext,
    },
    output: {
      originalChecks: savingCheckSchema.options.filter((check) =>
        golden.expected.some((save) => save.checks.includes(check)),
      ),
    },
    metadata: {
      set: golden.set,
      item: golden.item,
      sessionId: item.turn.sessionId,
    },
    splits: [],
  };
}

// The examples come sorted by set and item.
export function withTrialSplit(examples: ReplayExample[]): ReplayExample[] {
  const sessions = new Set<string>();
  return examples.map((example) => {
    const { sessionId } = example.metadata;
    if (sessions.size >= TRIAL_SIZE || sessions.has(sessionId)) {
      return example;
    }
    sessions.add(sessionId);
    return { ...example, splits: [TRIAL_SPLIT] };
  });
}
