// Dev only: the saving to the right place evaluation (#209). It reads the corpus from
// the live site's Phoenix project, and each turn's trip version from the live database,
// through the SSH tunnels (DEVELOPMENT.md sections 2 and 5).
//
// npm run saving -- turns
//   Finds the corpus turns where the coordinator saved to the trip brief or memory, and
//   writes them, mixed across sessions in sets of 10, to evals/saving/turns.json. It
//   stops if the file is already there, so the sets never change under Joe's notes.
// npm run saving -- review <set>
//   Writes the set's reading page, ~/tmp/road-trip-evals/saving/review/set-01.html, to
//   open in a browser. It also writes the set's notes file,
//   ~/tmp/road-trip-evals/saving/notes/set-01.md, unless it's already there, so notes
//   are never written over.
// npm run saving -- inputs <set> [<set> ...]
//   Writes each turn's labeler input to
//   ~/tmp/road-trip-evals/saving/inputs/set-01/<span ID>.md, to read what a labeler
//   gets. A turn whose saves were all refused has nothing to judge, so it gets none.
// npm run saving -- label <labeler> <set> [<set> ...]
//   Writes the sets' inputs, as inputs does, then runs a labeler, such as opus-5.5 or
//   gpt-sol-6.1, on each turn in them, with evals/saving/rubric.md as last committed.
//   The answers go in
//   ~/tmp/road-trip-evals/saving/labeling/<rubric commit>/set-01/<labeler>/, and an
//   answer already there is kept. It says which answers skip a save.
// npm run saving -- check-versions
//   Checks that each session's turns match trip versions that only go up, for every
//   session in evals/saving/turns.json, and says which don't.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { readCorpus } from "../grounded-eval/corpus-reader.js";
import type { CorpusSession } from "../grounded-eval/corpus-turn.js";
import { phoenixUrlOf } from "../grounded-eval/grounded-files.schema.js";
import {
  inputsDirOf,
  isLabelerName,
  LABELERS,
  type LabelingRun,
  readAnswers,
  readRubric,
  type Rubric,
  runLabeler,
  setFolderName,
} from "../grounded-eval/labeling.js";
import { RecordedSessionRepository } from "../turn-run/turn-run-repositories.js";
import { labelerInputOf, savesIn } from "./labeler-input.js";
import { notesFileOf, type ReviewItem, reviewPageOf } from "./review-page.js";
import { type SaveTurn, saveTurnsOf } from "./save-turns.js";
import { answerFitsSaves } from "./saving-answer.schema.js";
import { type TurnsFile, turnsFileSchema } from "./saving-files.schema.js";
import { EVALS_DIR, SAVING_LABELING } from "./saving-labeling.js";
import { turnBeforeOf, versionOrderProblems } from "./turn-before.js";

const TURNS_PATH = join("evals", "saving", "turns.json");
const REVIEW_TEMPLATE_PATH = join("evals", "saving", "review-page.html");
const RUBRIC_PATH = join("evals", "saving", "rubric.md");
const SEED = "saving-209";

type Action = (phoenixUrl: string, args: string[]) => Promise<void>;

const ACTIONS: Record<string, Action> = {
  turns: writeTurns,
  review: (phoenixUrl, args) => writeReview(phoenixUrl, setOf(args[0])),
  inputs: async (phoenixUrl, args) => {
    await writeInputs(phoenixUrl, setsOf(args));
  },
  label,
  "check-versions": checkVersions,
};

async function main(): Promise<void> {
  const [name = "", ...rest] = process.argv.slice(2);
  const action = ACTIONS[name];
  if (action === undefined) {
    throw new Error(`Give an action: ${Object.keys(ACTIONS).join(", ")}.`);
  }
  await action(phoenixUrlOf(process.env), rest);
}

async function writeTurns(phoenixUrl: string): Promise<void> {
  if (existsSync(TURNS_PATH)) {
    throw new Error(`${TURNS_PATH} is already there. Nothing was changed.`);
  }
  const sessions = await readCorpus(phoenixUrl);
  const file: TurnsFile = {
    seed: SEED,
    corpusSessions: sessions.length,
    corpusTurns: sessions.reduce((sum, s) => sum + s.turns.length, 0),
    turns: saveTurnsOf(sessions, SEED),
  };
  mkdirSync(join("evals", "saving"), { recursive: true });
  writeFileSync(TURNS_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(
    `Found ${String(file.turns.length)} turns with a save, of ${String(file.corpusTurns)} turns in ${String(file.corpusSessions)} sessions.`,
  );
}

async function writeReview(phoenixUrl: string, set: number): Promise<void> {
  const turns = turnsIn(set);
  const sessions = new Map(
    (await readCorpus(phoenixUrl)).map((s) => [s.sessionId, s]),
  );
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    const items = await reviewItemsOf(turns, sessions, livePool);
    const name = `set-${String(set).padStart(2, "0")}`;
    const pagePath = writeOut("review", `${name}.html`, () =>
      reviewPageOf(readFileSync(REVIEW_TEMPLATE_PATH, "utf8"), set, items),
    );
    console.log(`Wrote ${pagePath}.`);
    const notesPath = join(EVALS_DIR, "notes", `${name}.md`);
    if (existsSync(notesPath)) {
      console.log(`${notesPath} is already there, so it was left as it is.`);
    } else {
      writeOut("notes", `${name}.md`, () => notesFileOf(set, items));
      console.log(`Wrote ${notesPath}.`);
    }
  } finally {
    await livePool.end();
  }
}

// One set's turns to label: each one's span, and how many saves it has.
interface SetToLabel {
  set: number;
  saveCounts: Map<string, number>;
}

async function label(phoenixUrl: string, args: string[]): Promise<void> {
  const [labeler = "", ...setTexts] = args;
  if (!isLabelerName(labeler)) {
    throw new Error(
      `Give a labeler, one of ${Object.keys(LABELERS).join(", ")}, then the set numbers.`,
    );
  }
  const rubric = readRubric(RUBRIC_PATH);
  const sets = await writeInputs(phoenixUrl, setsOf(setTexts));
  for (const { set, saveCounts } of sets) {
    const run = { labeler, set, spanIds: [...saveCounts.keys()] };
    runLabeler(SAVING_LABELING, run, rubric);
    reportAnswers(run, rubric, saveCounts);
  }
}

// Writes each turn's labeler input, for every set, before any labeler runs, so the
// live database's tunnel is needed only at the start.
async function writeInputs(
  phoenixUrl: string,
  sets: readonly number[],
): Promise<SetToLabel[]> {
  const sessions = new Map(
    (await readCorpus(phoenixUrl)).map((s) => [s.sessionId, s]),
  );
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    const written: SetToLabel[] = [];
    for (const set of sets) {
      const items = await reviewItemsOf(turnsIn(set), sessions, livePool);
      written.push({ set, saveCounts: writeSetInputs(set, items) });
    }
    return written;
  } finally {
    await livePool.end();
  }
}

function writeSetInputs(
  set: number,
  items: readonly ReviewItem[],
): Map<string, number> {
  const dir = join(inputsDirOf(EVALS_DIR), setFolderName(set));
  mkdirSync(dir, { recursive: true });
  const saveCounts = new Map<string, number>();
  for (const { turn, session, before } of items) {
    const recorded = session.turns.find((t) => t.spanId === turn.spanId);
    const saves = recorded === undefined ? 0 : savesIn(recorded).length;
    if (saves === 0) {
      console.log(
        `Set ${String(set)}: ${turn.spanId} has no save that went through, so it isn't labeled.`,
      );
      continue;
    }
    writeFileSync(
      join(dir, `${turn.spanId}.md`),
      `${labelerInputOf(session, turn.spanId, before)}\n`,
    );
    saveCounts.set(turn.spanId, saves);
  }
  console.log(`Wrote ${String(saveCounts.size)} inputs to ${dir}.`);
  return saveCounts;
}

// Checks each answer, and says which ones skip a save, or number them wrong.
function reportAnswers(
  run: LabelingRun,
  rubric: Rubric,
  saveCounts: ReadonlyMap<string, number>,
): void {
  const answers = readAnswers(SAVING_LABELING, run, rubric.version);
  let saves = 0;
  let failures = 0;
  for (const [spanId, answer] of answers) {
    const count = saveCounts.get(spanId) ?? 0;
    if (!answerFitsSaves(answer, count)) {
      console.log(
        `${spanId}: the answer doesn't have one entry for each of its ${String(count)} saves, in order.`,
      );
    }
    saves += answer.saves.length;
    failures += answer.saves.filter((save) => save.failures.length > 0).length;
  }
  console.log(
    `${run.labeler}, set ${String(run.set)}: ${String(answers.size)} turns, ${String(failures)} of ${String(saves)} saves fail a check.`,
  );
}

async function checkVersions(phoenixUrl: string): Promise<void> {
  const file = readTurnsFile();
  const sessionIds = [...new Set(file.turns.map((turn) => turn.sessionId))];
  const sessions = new Map(
    (await readCorpus(phoenixUrl)).map((s) => [s.sessionId, s]),
  );
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    const live = new RecordedSessionRepository(livePool);
    let good = 0;
    for (const sessionId of sessionIds) {
      const corpus = sessions.get(sessionId);
      if (corpus === undefined) {
        throw new Error(`Session ${sessionId} isn't in the corpus.`);
      }
      const recorded = await live.session(sessionId);
      const problems = versionOrderProblems(
        sessionId,
        corpus.turns.map((turn) => turn.userMessage),
        await live.versionMessages(recorded.id),
      );
      good += problems.length === 0 ? 1 : 0;
      for (const problem of problems) {
        console.log(`${sessionId} ("${recorded.title}"): ${problem}`);
      }
    }
    console.log(
      `${String(good)} of ${String(sessionIds.length)} sessions match versions that only go up.`,
    );
  } finally {
    await livePool.end();
  }
}

async function reviewItemsOf(
  turns: readonly SaveTurn[],
  sessions: ReadonlyMap<string, CorpusSession>,
  livePool: Pool,
): Promise<ReviewItem[]> {
  const live = new RecordedSessionRepository(livePool);
  const settings = loadSettings(SETTINGS_PATH);
  const items: ReviewItem[] = [];
  for (const turn of turns) {
    const session = sessions.get(turn.sessionId);
    const index =
      session?.turns.findIndex((recorded) => recorded.spanId === turn.spanId) ??
      -1;
    const recorded = session?.turns[index];
    if (session === undefined || recorded === undefined) {
      throw new Error(`Turn ${turn.spanId} isn't in the corpus.`);
    }
    const before = await turnBeforeOf(live, settings, {
      agentSessionId: turn.sessionId,
      spanPosition: index + 1,
      message: recorded.userMessage,
    });
    items.push({ turn, session, before });
  }
  return items;
}

function writeOut(folder: string, file: string, text: () => string): string {
  const dir = join(EVALS_DIR, folder);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  writeFileSync(path, text());
  return path;
}

function readTurnsFile(): TurnsFile {
  return turnsFileSchema.parse(JSON.parse(readFileSync(TURNS_PATH, "utf8")));
}

function turnsIn(set: number): SaveTurn[] {
  const turns = readTurnsFile().turns.filter((turn) => turn.set === set);
  if (turns.length === 0) {
    throw new Error(`${TURNS_PATH} has no set ${String(set)}.`);
  }
  return turns;
}

function setsOf(texts: readonly string[]): number[] {
  if (texts.length === 0) {
    throw new Error("Give one or more set numbers, from 1.");
  }
  return texts.map(setOf);
}

function setOf(text: string | undefined): number {
  const set = Number(text);
  if (!Number.isInteger(set) || set < 1) {
    throw new Error("Give the set's number, from 1.");
  }
  return set;
}

await main();
