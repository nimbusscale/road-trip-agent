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
// npm run saving -- compare <labeler> <labeler> <set> [<set> ...]
//   Compares the two labelers' answers, from evals/saving/rubric.md as last committed,
//   on every save and check in the sets. Then it compares each one with Joe's labels in
//   evals/saving/calibration.json, on the sets that have them. It prints each split.
// npm run saving -- review <set> <labeler> [<labeler> ...]
//   With labelers, the reading page also shows each one's failures under each save,
//   from the committed rubric's answers, and Joe's labels on a calibration set, in
//   set-01-labels.html. It marks each save they split on. It writes no notes file.
// npm run saving -- check-versions
//   Checks that each session's turns match trip versions that only go up, for every
//   session in evals/saving/turns.json, and says which don't.
// npm run saving -- golden
//   Saves the golden set as the saving-golden dataset in Phoenix: each turn's labeler
//   input, with each save's settled checks. A save's label is Joe's, from
//   evals/saving/calibration.json or evals/saving/split-calls.json, or else the checks
//   both labelers fail on the full labeling's rubric. It stops if they split on a save
//   Joe didn't call. If the dataset is already there, it updates the turns that changed.
// npm run saving -- push-prompt
//   Pushes evals/saving/rubric.md, as last committed, as a version of the judge's
//   prompt in Phoenix, saving-judge, tagged rubric-<commit>.
// npm run saving -- experiment [rubric commit]
//   Runs the judge, Haiku through the API, on saving-golden as a Phoenix experiment, 3
//   times over, with the prompt pushed for the rubric's last commit, or the commit
//   given. Its description is that commit's subject line, so the subject should say
//   what the version changed. It prints each check's misses and false alarms, and
//   writes them, with the answers, to ~/tmp/road-trip-evals/saving/judge/. It bills
//   the API account through JUDGE_API_KEY.
// npm run saving -- report [rubric commit]
//   Writes the same report from the latest experiment on the rubric commit, from the
//   answers Phoenix saved, against the golden set's labels as they are now.
// npm run saving -- try-judge <rubric file> <runs> <set.item> [<set.item> ...]
//   Runs the judge on a few saving-golden turns, such as 4.2 for set 4 item 2, each the
//   number of runs given, with the rubric file on disk, committed or not, and prints
//   the same counts. Nothing is saved in Phoenix.
// npm run saving -- replay-dataset
//   Saves the replays' cases as the saving-replays dataset in Phoenix, if it isn't there
//   yet: each saving-golden turn that fails a check, with its recorded session and turn,
//   and its judge input up to the turn. The first case of each of the first 3 sessions
//   is in the trial-1 split.
// npm run saving -- replay <trial set or all> <runs per case>
//   Runs the cases on today's code, each with run-turn's run, as a Phoenix experiment,
//   and the judge, Haiku through the API, checks each run's saves, with the prompt
//   pushed for the rubric's last commit. A trial set, such as trial-1, runs only its
//   cases, and all runs every case. Its description is the last commit's subject line.
//   It stops if there are uncommitted changes, since the experiment would be named for
//   a commit that isn't the code that ran. It needs both tunnels and the local
//   Postgres, and bills the API account through JUDGE_API_KEY for the judge. At the
//   end it writes the report, as replay-report does.
// npm run saving -- replay-resume <experiment ID> [most runs]
//   Runs again an experiment's runs that failed or never ran, such as on the Claude
//   plan's limit, and writes the report. With a number, it runs at most that many, to
//   see how much of the plan's limit they use, and the rest stay failed for the next
//   resume.
// npm run saving -- replay-report [experiment ID]
//   Writes the report for the experiment, or the latest one on saving-replays, from
//   what Phoenix saved, to ~/tmp/road-trip-evals/saving/replays/<experiment ID>/: each
//   case's runs, how many passed, passed the checks its golden turn failed, and saved
//   nothing, the failures the judge found, and every run's output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

import { livePoolConfigOf } from "../config/live-env.schema.js";
import { readCorpus } from "../grounded-eval/corpus-reader.js";
import { phoenixUrlOf } from "../grounded-eval/grounded-files.schema.js";
import {
  inputsDirOf,
  isLabelerName,
  type LabelerName,
  LABELERS,
  type LabelingRun,
  readAnswers,
  readRubric,
  type Rubric,
  runLabeler,
  setFolderName,
} from "../grounded-eval/labeling.js";
import { RecordedSessionRepository } from "../turn-run/turn-run-repositories.js";
import {
  comparisonReportsOf,
  joeLabelsOf,
  labelsOf,
  readTurnsFile,
  RUBRIC_PATH,
  TURNS_PATH,
  turnsIn,
} from "./label-files.js";
import { writeGoldenSet } from "./golden-set.js";
import { JUDGE_ACTIONS } from "./saving-judge.js";
import { REPLAY_ACTIONS } from "./replay-actions.js";
import { labelerInputOf, savesIn } from "./labeler-input.js";
import { notesFileOf, type ReviewItem, reviewPageOf } from "./review-page.js";
import { saveTurnsOf } from "./save-turns.js";
import { answerFitsSaves } from "./saving-answer.schema.js";
import type { TurnsFile } from "./saving-files.schema.js";
import { EVALS_DIR, SAVING_LABELING } from "./saving-labeling.js";
import { reviewItemsOf } from "./review-items.js";
import { versionOrderProblems } from "./turn-before.js";

const REVIEW_TEMPLATE_PATH = join("evals", "saving", "review-page.html");
const SEED = "saving-209";

type Action = (phoenixUrl: string, args: string[]) => Promise<void>;

const ACTIONS: Record<string, Action> = {
  turns: writeTurns,
  review: (phoenixUrl, [set, ...labelers]) =>
    writeReview(phoenixUrl, setOf(set), labelers.map(labelerOf)),
  compare: (phoenixUrl, [first, second, ...sets]) => {
    for (const report of comparisonReportsOf(
      labelerOf(first),
      labelerOf(second),
      setsOf(sets),
    )) {
      console.log(report);
    }
    return Promise.resolve();
  },
  inputs: async (phoenixUrl, args) => {
    await writeInputs(phoenixUrl, setsOf(args));
  },
  label,
  "check-versions": checkVersions,
  golden: writeGoldenSet,
  ...JUDGE_ACTIONS,
  ...REPLAY_ACTIONS,
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

async function writeReview(
  phoenixUrl: string,
  set: number,
  labelers: readonly LabelerName[],
): Promise<void> {
  const turns = turnsIn(set);
  const labels = labelsOf(set, labelers);
  const sessions = new Map(
    (await readCorpus(phoenixUrl)).map((s) => [s.sessionId, s]),
  );
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    const items = await reviewItemsOf(turns, sessions, livePool);
    const name = setFolderName(set);
    const pageName = labelers.length === 0 ? name : `${name}-labels`;
    const pagePath = writeOut("review", `${pageName}.html`, () =>
      reviewPageOf(readFileSync(REVIEW_TEMPLATE_PATH, "utf8"), set, {
        items,
        labels,
        joe: labelers.length === 0 ? new Map() : joeLabelsOf(set),
      }),
    );
    console.log(`Wrote ${pagePath}.`);
    if (labelers.length > 0) {
      return;
    }
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
  const [labelerText, ...setTexts] = args;
  const labeler = labelerOf(labelerText);
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

function writeOut(folder: string, file: string, text: () => string): string {
  const dir = join(EVALS_DIR, folder);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  writeFileSync(path, text());
  return path;
}

function labelerOf(text: string | undefined): LabelerName {
  if (text === undefined || !isLabelerName(text)) {
    throw new Error(
      `Give a labeler, one of ${Object.keys(LABELERS).join(", ")}.`,
    );
  }
  return text;
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
