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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";

import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { readCorpus } from "../grounded-eval/corpus-reader.js";
import type { CorpusSession } from "../grounded-eval/corpus-turn.js";
import { phoenixUrlOf } from "../grounded-eval/grounded-files.schema.js";
import { RecordedSessionRepository } from "../turn-run/turn-run-repositories.js";
import { notesFileOf, type ReviewItem, reviewPageOf } from "./review-page.js";
import { type SaveTurn, saveTurnsOf } from "./save-turns.js";
import { type TurnsFile, turnsFileSchema } from "./saving-files.schema.js";
import { turnBeforeOf } from "./turn-before.js";

const TURNS_PATH = join("evals", "saving", "turns.json");
const REVIEW_TEMPLATE_PATH = join("evals", "saving", "review-page.html");
const SEED = "saving-209";

// Outside the repo, as the grounded evaluator's files are, so a labeler's harness
// started there later doesn't load the repo's CLAUDE.md (#282, step 4).
const EVALS_DIR = join(homedir(), "tmp", "road-trip-evals", "saving");

async function main(): Promise<void> {
  const [action, setText] = process.argv.slice(2);
  const phoenixUrl = phoenixUrlOf(process.env);
  switch (action) {
    case "turns":
      await writeTurns(phoenixUrl);
      return;
    case "review":
      await writeReview(phoenixUrl, setOf(setText));
      return;
    default:
      throw new Error("Give an action: turns, or review <set>.");
  }
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

function turnsIn(set: number): SaveTurn[] {
  const file = turnsFileSchema.parse(
    JSON.parse(readFileSync(TURNS_PATH, "utf8")),
  );
  const turns = file.turns.filter((turn) => turn.set === set);
  if (turns.length === 0) {
    throw new Error(`${TURNS_PATH} has no set ${String(set)}.`);
  }
  return turns;
}

function setOf(text: string | undefined): number {
  const set = Number(text);
  if (!Number.isInteger(set) || set < 1) {
    throw new Error("Give the set's number, from 1.");
  }
  return set;
}

await main();
