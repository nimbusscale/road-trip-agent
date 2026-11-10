import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  inputsDirOf,
  type LabelerName,
  readAnswers,
  readRubric,
  setFolderName,
} from "../grounded-eval/labeling.js";
import {
  comparisonOf,
  comparisonReportOf,
  type LabeledSave,
  labeledSavesOf,
  type SaveRef,
} from "./label-compare.js";
import type { SavingAnswer } from "./saving-answer.schema.js";
import type { SaveTurn } from "./save-turns.js";
import {
  type CalibrationFile,
  calibrationFileSchema,
  type CalibrationTurn,
  type TurnsFile,
  turnsFileSchema,
} from "./saving-files.schema.js";
import { EVALS_DIR, SAVING_LABELING } from "./saving-labeling.js";

export const TURNS_PATH = join("evals", "saving", "turns.json");
export const RUBRIC_PATH = join("evals", "saving", "rubric.md");
const CALIBRATION_PATH = join("evals", "saving", "calibration.json");
const SPLIT_CALLS_PATH = join("evals", "saving", "split-calls.json");

export function readTurnsFile(): TurnsFile {
  return turnsFileSchema.parse(JSON.parse(readFileSync(TURNS_PATH, "utf8")));
}

export function turnsIn(set: number): SaveTurn[] {
  const turns = readTurnsFile().turns.filter((turn) => turn.set === set);
  if (turns.length === 0) {
    throw new Error(`${TURNS_PATH} has no set ${String(set)}.`);
  }
  return turns;
}

// Joe's labels for the set's turns, by span ID. A set he didn't label has none.
export function joeLabelsOf(set: number): Map<string, CalibrationTurn> {
  return new Map(
    readCalibration()
      .turns.filter((turn) => turn.set === set)
      .map((turn) => [turn.spanId, turn]),
  );
}

function readCalibration(): CalibrationFile {
  return readLabelsFile(CALIBRATION_PATH);
}

// Joe's labels in calibration.json or split-calls.json, which share a shape.
function readLabelsFile(path: string): CalibrationFile {
  return calibrationFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

// Every save in the sets, with the labelers' answers on the given rubric version, and
// Joe's labels: the calibration sets' in calibration.json, and his calls on the full
// labeling's splits in split-calls.json, for the saves he called.
export function goldenSavesOf(
  sets: readonly number[],
  labelers: readonly LabelerName[],
  rubricVersion: string,
): LabeledSave[] {
  const joe = {
    turns: [
      ...readCalibration().turns,
      ...readLabelsFile(SPLIT_CALLS_PATH).turns,
    ],
  };
  return sets.flatMap((set) =>
    labeledSavesOf(
      saveRefsOf(set),
      answersAt(set, labelers, rubricVersion),
      joe,
    ),
  );
}

// The turns in a set that have a labeler input, with their item numbers on the set's
// page. A turn whose saves were all refused has no input.
function labeledTurnsOf(set: number): { spanId: string; item: number }[] {
  return turnsIn(set)
    .map(({ spanId }, index) => ({ spanId, item: index + 1 }))
    .filter(({ spanId }) => existsSync(inputPathOf(set, spanId)));
}

// Each save in the set's labeler inputs, numbered as the labelers saw them.
function saveRefsOf(set: number): SaveRef[] {
  return labeledTurnsOf(set).flatMap(({ spanId, item }) =>
    savesInInput(readFileSync(inputPathOf(set, spanId), "utf8")).map(
      ({ n, tool }) => ({ set, item, spanId, n, tool }),
    ),
  );
}

// The labeler input marks each save as <save n="1" tool="add_memory_item">
// (labeler-input.ts).
function savesInInput(input: string): { n: number; tool: string }[] {
  return [...input.matchAll(/<save n="(\d+)" tool="([a-z_]+)">/g)].map(
    ([, n = "", tool = ""]) => ({ n: Number(n), tool }),
  );
}

// Each labeler's answers for the set's labeled turns, made with the committed rubric.
export function labelsOf(
  set: number,
  labelers: readonly LabelerName[],
): Record<string, Map<string, SavingAnswer>> {
  if (labelers.length === 0) {
    return {};
  }
  return answersAt(set, labelers, readRubric(RUBRIC_PATH).version);
}

function answersAt(
  set: number,
  labelers: readonly LabelerName[],
  version: string,
): Record<string, Map<string, SavingAnswer>> {
  const spanIds = labeledTurnsOf(set).map((turn) => turn.spanId);
  return Object.fromEntries(
    labelers.map((labeler) => [
      labeler,
      readAnswers(SAVING_LABELING, { labeler, set, spanIds }, version),
    ]),
  );
}

// The two labelers compared on every save in the sets, then each one compared with
// Joe's labels, on the sets that have them.
export function comparisonReportsOf(
  first: LabelerName,
  second: LabelerName,
  sets: readonly number[],
): string[] {
  const calibration = readCalibration();
  const calibrationSets = new Set(calibration.turns.map((turn) => turn.set));
  const labeled = sets.flatMap((set) =>
    labeledSavesOf(
      saveRefsOf(set),
      labelsOf(set, [first, second]),
      calibration,
    ),
  );
  const calibrated = labeled.filter(({ save }) =>
    calibrationSets.has(save.set),
  );
  return [
    comparisonOf(labeled, first, second),
    comparisonOf(calibrated, "joe", first),
    comparisonOf(calibrated, "joe", second),
  ].map(comparisonReportOf);
}

function inputPathOf(set: number, spanId: string): string {
  return join(inputsDirOf(EVALS_DIR), setFolderName(set), `${spanId}.md`);
}
