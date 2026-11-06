// Dev only: the "grounded in the record" evaluator (#282). It reads the corpus from the
// live site's Phoenix project, through the SSH tunnel (DEVELOPMENT.md section 2).
//
// npm run grounded -- sample
//   Picks the sampled turns, and writes evals/grounded/sample.json. It stops if the file
//   is already there, so a labeled sample is never replaced.
// npm run grounded -- inputs
//   Writes each sampled turn's judge input to its own file, outside the repo, in
//   ~/tmp/road-trip-evals/grounded/inputs/, one folder for each set of 5, such as
//   set-01/<span ID>.md.
// npm run grounded -- label <labeler> <set>
//   Runs a labeler, opus-5.5 or gpt-sol-6.1, on each turn in the set, with
//   evals/grounded/rubric.md as last committed. Its answers go in
//   ~/tmp/road-trip-evals/grounded/labeling/<rubric commit>/.
// npm run grounded -- save-labels <labeler> <set>
//   Checks the labeler's answers for the set, and saves them as its annotations.
// npm run grounded -- save-call <span ID> <label> ["<quote>|<why>" ...]
//   Saves Joe's call on a turn as his `joe` annotation: its label, and each fact he
//   found ungrounded, with why.
// npm run grounded -- review <set>
//   Writes the set's review page, ~/tmp/road-trip-evals/grounded/review/set-01.html, to
//   open in a browser. It shows each turn's judge input, and no labels.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readCorpus } from "./corpus-reader.js";
import { saveAnnotations } from "./grounded-annotations.js";
import {
  phoenixUrlOf,
  type SampleFile,
  sampleFileSchema,
} from "./grounded-files.schema.js";
import { judgeInputOf } from "./judge-input.js";
import { groundedLabelSchema } from "./label-answer.schema.js";
import {
  EVALS_DIR,
  INPUTS_DIR,
  isLabelerName,
  type LabelerName,
  readAnswers,
  type Rubric,
  runLabeler,
  setFolderName,
} from "./labeling.js";
import { reviewPageOf } from "./review-page.js";
import { pickSample } from "./sample.js";

const SAMPLE_PATH = join("evals", "grounded", "sample.json");
const RUBRIC_PATH = join("evals", "grounded", "rubric.md");
const REVIEW_TEMPLATE_PATH = join("evals", "grounded", "review-page.html");
const SAMPLE_SIZE = 60;
const SEED = "grounded-282";

async function main(): Promise<void> {
  const [action, ...rest] = process.argv.slice(2);
  const phoenixUrl = phoenixUrlOf(process.env);
  if (action === "sample") {
    await writeSample(phoenixUrl);
  } else if (action === "inputs") {
    await writeInputs(phoenixUrl);
  } else if (action === "label") {
    const { labeler, set } = labelerAndSet(rest);
    runLabeler(labeler, set, spanIdsIn(set), readRubric());
  } else if (action === "save-labels") {
    const { labeler, set } = labelerAndSet(rest);
    const { version } = readRubric();
    const answers = readAnswers(labeler, set, spanIdsIn(set), version);
    await saveAnnotations(
      phoenixUrl,
      { identifier: labeler, kind: "LLM" },
      answers,
      version,
    );
    console.log(`Saved ${String(answers.size)} labels from ${labeler}.`);
  } else if (action === "save-call") {
    await saveCall(phoenixUrl, rest);
  } else if (action === "review") {
    await writeReviewPage(phoenixUrl, Number(rest[0]));
  } else {
    throw new Error(
      "Give an action: sample, inputs, label, save-labels, save-call, or review.",
    );
  }
}

// Joe names only the facts he found ungrounded, not every fact, so his label is taken
// as he gives it.
async function saveCall(phoenixUrl: string, args: string[]): Promise<void> {
  const [spanId = "", labelText, ...factTexts] = args;
  const label = groundedLabelSchema.parse(labelText);
  const facts = factTexts.map((text) => {
    const [quote = "", why = ""] = text.split("|");
    return { quote, source: "none", grounded: false, why };
  });
  if ((label === "not_grounded") !== facts.length > 0) {
    throw new Error(
      "Give ungrounded facts when, and only when, the label is not_grounded.",
    );
  }
  await saveAnnotations(
    phoenixUrl,
    { identifier: "joe", kind: "HUMAN" },
    new Map([[spanId, { label, facts }]]),
    readRubric().version,
  );
  console.log(`Saved Joe's call on ${spanId}: ${label}.`);
}

async function writeSample(phoenixUrl: string): Promise<void> {
  if (existsSync(SAMPLE_PATH)) {
    throw new Error(`${SAMPLE_PATH} is already there. Nothing was changed.`);
  }
  const sessions = await readCorpus(phoenixUrl);
  const sample: SampleFile = {
    seed: SEED,
    corpusSessions: sessions.length,
    corpusTurns: sessions.reduce((sum, s) => sum + s.turns.length, 0),
    turns: pickSample(sessions, SAMPLE_SIZE, SEED),
  };
  writeFileSync(SAMPLE_PATH, `${JSON.stringify(sample, null, 2)}\n`);
  console.log(
    `Picked ${String(sample.turns.length)} of ${String(sample.corpusTurns)} turns, from ${String(sample.corpusSessions)} sessions.`,
  );
}

async function writeInputs(phoenixUrl: string): Promise<void> {
  const sample = readSample();
  const sessions = new Map(
    (await readCorpus(phoenixUrl)).map((s) => [s.sessionId, s]),
  );
  for (const turn of sample.turns) {
    const session = sessions.get(turn.sessionId);
    if (session === undefined) {
      throw new Error(`Session ${turn.sessionId} isn't in the corpus.`);
    }
    const dir = join(INPUTS_DIR, setFolderName(turn.set));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${turn.spanId}.md`),
      `${judgeInputOf(session, turn.spanId)}\n`,
    );
  }
  console.log(`Wrote ${String(sample.turns.length)} inputs to ${INPUTS_DIR}.`);
}

async function writeReviewPage(phoenixUrl: string, set: number): Promise<void> {
  const spanIds = spanIdsIn(set);
  const sessions = await readCorpus(phoenixUrl);
  const items = spanIds.map((spanId) => {
    const session = sessions.find((s) =>
      s.turns.some((turn) => turn.spanId === spanId),
    );
    if (session === undefined) {
      throw new Error(`Turn ${spanId} isn't in the corpus.`);
    }
    return { session, spanId };
  });
  const dir = join(EVALS_DIR, "review");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${setFolderName(set)}.html`);
  writeFileSync(
    path,
    reviewPageOf(readFileSync(REVIEW_TEMPLATE_PATH, "utf8"), set, items),
  );
  console.log(`Wrote ${path}.`);
}

function readSample(): SampleFile {
  return sampleFileSchema.parse(JSON.parse(readFileSync(SAMPLE_PATH, "utf8")));
}

function spanIdsIn(set: number): string[] {
  const spanIds = readSample()
    .turns.filter((turn) => turn.set === set)
    .map((turn) => turn.spanId);
  if (spanIds.length === 0) {
    throw new Error(`The sample has no set ${String(set)}.`);
  }
  return spanIds;
}

function labelerAndSet(args: string[]): { labeler: LabelerName; set: number } {
  const [labeler = "", setText] = args;
  const set = Number(setText);
  if (!isLabelerName(labeler) || !Number.isInteger(set)) {
    throw new Error(
      "Give a labeler, opus-5.5 or gpt-sol-6.1, and a set number.",
    );
  }
  return { labeler, set };
}

// The rubric, with the commit that last changed it as its version. It must be
// committed, so `git show <version>:evals/grounded/rubric.md` gives the exact text
// each label was made with.
function readRubric(): Rubric {
  const changes = execFileSync(
    "git",
    ["status", "--porcelain", "--", RUBRIC_PATH],
    {
      encoding: "utf8",
    },
  );
  if (changes.trim() !== "") {
    throw new Error(
      `Commit ${RUBRIC_PATH} first, so its commit names this version.`,
    );
  }
  const version = execFileSync(
    "git",
    ["log", "-1", "--format=%h", "--", RUBRIC_PATH],
    { encoding: "utf8" },
  ).trim();
  return { text: readFileSync(RUBRIC_PATH, "utf8"), version };
}

await main();
