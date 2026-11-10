import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { claudeResultSchema } from "./label-answer.schema.js";

// What sets one evaluator's labeling apart from another's (#282, #209): where its files
// go, the heading its input goes under after the rubric, and its answer's schema.
export interface LabelingTask<Answer> {
  // The evaluator's folder outside the repo, such as ~/tmp/road-trip-evals/grounded.
  // Everything a labeler reads or writes is there, so a harness started there doesn't
  // load the repo's CLAUDE.md (#282, step 4).
  evalsDir: string;
  inputHeading: string;
  // The answer's JSON Schema, which the harnesses check the answer against.
  answerJsonSchema: string;
  parseAnswer: (answer: unknown) => Answer;
}

// One labeler on one set's turns.
export interface LabelingRun {
  labeler: LabelerName;
  set: number;
  spanIds: string[];
}

// Each turn's input, as the labeler reads it after the rubric, goes in its set's folder
// here, such as inputs/set-01/<span ID>.md.
export function inputsDirOf(evalsDir: string): string {
  return join(evalsDir, "inputs");
}

function labelingDirOf(evalsDir: string): string {
  return join(evalsDir, "labeling");
}

// Claude Code signs in once in the simulated users' config folder, which keeps out
// Joe's own CLAUDE.md, settings, and memory (simulated-users/README.md).
const CLAUDE_CONFIG_DIR = join(homedir(), "tmp", "road-trip-sims", ".claude");

// The answer's JSON Schema, as text and as a file, and where the answer goes.
interface HarnessFiles {
  answerSchema: string;
  answerSchemaPath: string;
  answerPath: string;
}

type Effort = "high" | "medium";

// How a labeler's harness runs one prompt.
interface Labeler {
  command: string;
  // Whether the harness prints the answer on standard output, rather than writing it
  // to the answer file itself.
  savesStdout: boolean;
  args: (files: HarnessFiles) => string[];
  answerOf: (output: string) => unknown;
}

// Each labeler's identifier on its annotations, and how its harness runs one prompt.
// Each runs on high effort, unless its name says medium. The Claude models have no tools. Codex reads the prompt with
// no need for commands, and its sandbox can't write outside the run folder.
export const LABELERS = {
  "opus-5.5": claudeLabeler("claude-opus-5-5", "high"),
  "sonnet-5.5": claudeLabeler("claude-sonnet-5-5", "high"),
  "sonnet-5.5-medium": claudeLabeler("claude-sonnet-5-5", "medium"),
  // A first look at the judge's model, run through Claude Code. The judge itself calls
  // the API in step 8, under its own identifier, haiku-5.5.
  "haiku-5.5-cc": claudeLabeler("claude-haiku-5-5", "high"),
  "gpt-sol-6.1": codexLabeler("gpt-6.1-sol", "high"),
  "gpt-sol-6.1-medium": codexLabeler("gpt-6.1-sol", "medium"),
  "gpt-terra-6.1": codexLabeler("gpt-6.1-terra", "high"),
  "gpt-terra-6.1-medium": codexLabeler("gpt-6.1-terra", "medium"),
};

// Claude Code prints its result, with the answer in it, on standard output.
function claudeLabeler(model: string, effort: Effort): Labeler {
  return {
    command: "claude",
    savesStdout: true,
    args: ({ answerSchema }) => [
      "-p",
      "--model",
      model,
      "--effort",
      effort,
      "--tools",
      "",
      "--output-format",
      "json",
      "--json-schema",
      answerSchema,
    ],
    answerOf: (output) => claudeResultSchema.parse(JSON.parse(output)),
  };
}

// codex exec writes its last message, the answer's JSON, to the -o file.
function codexLabeler(model: string, effort: Effort): Labeler {
  return {
    command: "codex",
    savesStdout: false,
    args: ({ answerSchemaPath, answerPath }) => [
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--ephemeral",
      "-m",
      model,
      "-c",
      `model_reasoning_effort=${effort}`,
      "-s",
      "read-only",
      "--output-schema",
      answerSchemaPath,
      "-o",
      answerPath,
      "-",
    ],
    answerOf: (output): unknown => JSON.parse(output),
  };
}

export type LabelerName = keyof typeof LABELERS;

export function isLabelerName(name: string): name is LabelerName {
  return Object.hasOwn(LABELERS, name);
}

// The rubric's text, and its version: the commit that last changed it.
export interface Rubric {
  text: string;
  version: string;
}

// Each rubric version's answers are kept apart, so a rerun never mixes them.
function answersDirOf(
  evalsDir: string,
  rubricVersion: string,
  { set, labeler }: LabelingRun,
): string {
  return join(
    labelingDirOf(evalsDir),
    rubricVersion,
    setFolderName(set),
    labeler,
  );
}

export function setFolderName(set: number): string {
  return `set-${String(set).padStart(2, "0")}`;
}

// The labeler's prompt: the rubric, then the turn's input under the task's heading.
// The judge gets the same text.
export function labelPromptOf(
  task: Pick<LabelingTask<unknown>, "inputHeading">,
  rubric: string,
  input: string,
): string {
  return `${rubric.trim()}\n\n## ${task.inputHeading}\n\n${input.trim()}\n`;
}

// The rubric at a path, with the commit that last changed it as its version. It must
// be committed, so `git show <version>:<path>` gives the exact text each label was made
// with.
export function readRubric(path: string): Rubric {
  const changes = execFileSync("git", ["status", "--porcelain", "--", path], {
    encoding: "utf8",
  });
  if (changes.trim() !== "") {
    throw new Error(`Commit ${path} first, so its commit names this version.`);
  }
  const version = execFileSync(
    "git",
    ["log", "-1", "--format=%h", "--", path],
    { encoding: "utf8" },
  ).trim();
  return { text: readFileSync(path, "utf8"), version };
}

// Runs the labeler on each turn in the set that has no answer yet, and saves what its
// harness printed. An answer already there is kept, so a run cut off partway can go on.
export function runLabeler<Answer>(
  task: LabelingTask<Answer>,
  run: LabelingRun,
  rubric: Rubric,
): void {
  const answersDir = answersDirOf(task.evalsDir, rubric.version, run);
  mkdirSync(answersDir, { recursive: true });
  const answerSchemaPath = join(
    labelingDirOf(task.evalsDir),
    "answer-schema.json",
  );
  writeFileSync(answerSchemaPath, task.answerJsonSchema);
  const { command, args, savesStdout } = LABELERS[run.labeler];
  for (const spanId of run.spanIds) {
    const answerPath = join(answersDir, `${spanId}.txt`);
    if (existsSync(answerPath)) {
      continue;
    }
    const input = readFileSync(
      join(inputsDirOf(task.evalsDir), setFolderName(run.set), `${spanId}.md`),
      "utf8",
    );
    console.log(`${run.labeler}: labeling ${spanId}`);
    const result = spawnSync(
      command,
      args({
        answerSchema: task.answerJsonSchema,
        answerSchemaPath,
        answerPath,
      }),
      {
        cwd: labelingDirOf(task.evalsDir),
        input: labelPromptOf(task, rubric.text, input),
        encoding: "utf8",
        env: harnessEnv(),
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (result.status !== 0) {
      throw new Error(`${run.labeler} failed on ${spanId}: ${result.stderr}`);
    }
    // Codex's log shows each command it ran, to check it read nothing else.
    writeFileSync(
      savesStdout ? answerPath : join(answersDir, `${spanId}.log`),
      savesStdout ? result.stdout : `${result.stdout}${result.stderr}`,
    );
  }
}

// Reads and checks the labeler's answer for each turn in the set.
export function readAnswers<Answer>(
  task: LabelingTask<Answer>,
  run: LabelingRun,
  rubricVersion: string,
): Map<string, Answer> {
  const answersDir = answersDirOf(task.evalsDir, rubricVersion, run);
  return new Map(
    run.spanIds.map((spanId) => {
      const output = readFileSync(join(answersDir, `${spanId}.txt`), "utf8");
      return [spanId, task.parseAnswer(LABELERS[run.labeler].answerOf(output))];
    }),
  );
}

// The labelers sign in with Joe's own accounts, so every ANTHROPIC_ variable and the
// app's plan token are left out. An API key would bill an API account instead.
function harnessEnv(): Record<string, string | undefined> {
  const kept = Object.entries(process.env).filter(
    ([name]) =>
      !name.startsWith("ANTHROPIC_") && name !== "CLAUDE_CODE_OAUTH_TOKEN",
  );
  return Object.fromEntries([
    ...kept,
    ["CLAUDE_CONFIG_DIR", CLAUDE_CONFIG_DIR],
  ]);
}
