import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type GoldenExample,
  saveGoldenDataset,
} from "../grounded-eval/golden-dataset.js";
import {
  inputsDirOf,
  type LabelerName,
  setFolderName,
} from "../grounded-eval/labeling.js";
import { comparisonOf, type LabeledSave } from "./label-compare.js";
import { goldenSavesOf, readTurnsFile } from "./label-files.js";
import { type SavingCheck, savingCheckSchema } from "./saving-answer.schema.js";
import { EVALS_DIR } from "./saving-labeling.js";

export const GOLDEN_DATASET = "saving-golden";

// The full labeling (decision 19 in evals/saving/decisions.md): both labelers labeled
// every turn on this rubric version, and Joe called each save they split on. Later
// labels, such as Opus's check of the rubric change on 36 turns, aren't settled ones.
export const GOLDEN_RUBRIC = "49b4a5c";
export const GOLDEN_LABELERS: readonly [LabelerName, LabelerName] = [
  "opus-5.5",
  "gpt-sol-6.1",
];

export interface SettledSave {
  n: number;
  tool: string;
  checks: SavingCheck[];
  labelFrom: "joe" | "labelers";
}

export interface SettledTurn {
  set: number;
  item: number;
  spanId: string;
  saves: SettledSave[];
}

// Each turn's settled label, save by save: Joe's label where he gave one, and
// otherwise the checks both labelers fail. It throws, naming each one, when the
// labelers split on a save Joe didn't call, so a split can't slip into the golden set.
export function settledTurnsOf(
  labeled: readonly LabeledSave[],
  [first, second]: readonly [string, string],
): SettledTurn[] {
  const turns = new Map<string, SettledTurn>();
  const unsettled: string[] = [];
  for (const labeledSave of labeled) {
    const { save, flags } = labeledSave;
    const turn = turns.get(save.spanId) ?? {
      set: save.set,
      item: save.item,
      spanId: save.spanId,
      saves: [],
    };
    turns.set(save.spanId, turn);
    const joe = flags.joe;
    if (joe !== undefined) {
      turn.saves.push({ ...saveOf(labeledSave, joe), labelFrom: "joe" });
      continue;
    }
    const splits = comparisonOf([labeledSave], first, second).splits;
    if (flags[first] === undefined || flags[second] === undefined) {
      unsettled.push(`${whereOf(labeledSave)}: a labeler has no answer`);
    } else if (splits.length > 0) {
      unsettled.push(
        `${whereOf(labeledSave)}: ${splits.map((s) => s.check).join(", ")}`,
      );
    } else {
      turn.saves.push({
        ...saveOf(labeledSave, flags[first]),
        labelFrom: "labelers",
      });
    }
  }
  if (unsettled.length > 0) {
    throw new Error(
      `These saves have no settled label, so Joe needs to call them:\n${unsettled.join("\n")}`,
    );
  }
  return [...turns.values()];
}

function saveOf(
  { save }: LabeledSave,
  flags: readonly { check: SavingCheck }[],
): Omit<SettledSave, "labelFrom"> {
  const failing = new Set(flags.map((flag) => flag.check));
  return {
    n: save.n,
    tool: save.tool,
    checks: savingCheckSchema.options.filter((check) => failing.has(check)),
  };
}

function whereOf({ save }: LabeledSave): string {
  return `set ${String(save.set)} item ${String(save.item)} save ${String(save.n)}`;
}

// A golden set example: the labeler input, which the judge reads too, and each save's
// settled checks. Where each save's label came from goes in the metadata.
export function goldenExampleOf(
  turn: SettledTurn,
  sessionId: string,
  labelerInput: string,
): GoldenExample {
  return {
    spanId: turn.spanId,
    input: { spanId: turn.spanId, labelerInput },
    output: {
      saves: turn.saves.map(({ n, tool, checks }) => ({ n, tool, checks })),
    },
    metadata: {
      set: turn.set,
      item: turn.item,
      sessionId,
      labelFrom: turn.saves.map(({ n, labelFrom }) => ({ n, labelFrom })),
    },
  };
}

// npm run saving -- golden (saving.ts).
export async function writeGoldenSet(phoenixUrl: string): Promise<void> {
  const { turns } = readTurnsFile();
  const sets = [...new Set(turns.map((turn) => turn.set))];
  const settled = settledTurnsOf(
    goldenSavesOf(sets, GOLDEN_LABELERS, GOLDEN_RUBRIC),
    GOLDEN_LABELERS,
  );
  const settledIds = new Set(settled.map((turn) => turn.spanId));
  const missing = turns.filter((turn) => !settledIds.has(turn.spanId));
  if (missing.length > 0) {
    // A turn whose saves were all refused has no labeler input, so it has nothing to
    // judge. Any other turn without one needs `inputs` run for its set.
    console.log(
      `${String(missing.length)} turns have no labeler input, so they aren't in the golden set: ${missing.map((turn) => turn.spanId).join(", ")}.`,
    );
  }
  const sessionOf = new Map(turns.map((turn) => [turn.spanId, turn.sessionId]));
  const examples = settled.map((turn) =>
    goldenExampleOf(
      turn,
      sessionOf.get(turn.spanId) ?? "",
      readFileSync(
        join(
          inputsDirOf(EVALS_DIR),
          setFolderName(turn.set),
          `${turn.spanId}.md`,
        ),
        "utf8",
      ),
    ),
  );
  console.log(
    await saveGoldenDataset(
      phoenixUrl,
      {
        name: GOLDEN_DATASET,
        description:
          "The saving evaluator's golden set (#209): each turn's labeler input, with each save's settled checks.",
      },
      examples,
    ),
  );
}
