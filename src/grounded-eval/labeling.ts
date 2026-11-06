import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  claudeResultSchema,
  type LabelAnswer,
  labelAnswerJsonSchema,
  labelAnswerSchema,
} from "./label-answer.schema.js";

// Everything a labeler reads or writes is outside the repo, so a harness started there
// doesn't load the repo's CLAUDE.md (#282, step 4).
export const EVALS_DIR = join(homedir(), "tmp", "road-trip-evals", "grounded");
export const INPUTS_DIR = join(EVALS_DIR, "inputs");
const LABELING_DIR = join(EVALS_DIR, "labeling");
const ANSWER_SCHEMA_PATH = join(LABELING_DIR, "answer-schema.json");

// Claude Code signs in once in the simulated users' config folder, which keeps out
// Joe's own CLAUDE.md, settings, and memory (simulated-users/README.md).
const CLAUDE_CONFIG_DIR = join(homedir(), "tmp", "road-trip-sims", ".claude");

// The answer's JSON Schema, and where the answer goes.
interface HarnessFiles {
  answerSchema: string;
  answerPath: string;
}

// Each labeler's identifier on its annotations, and how its harness runs one prompt.
// Both run on high effort. Opus has no tools. Codex reads the prompt with no need for
// commands, and its sandbox can't write outside the run folder.
export const LABELERS = {
  "opus-5.5": {
    command: "claude",
    // Claude Code prints its result, with the answer in it, on standard output.
    savesStdout: true,
    args: ({ answerSchema }: HarnessFiles) => [
      "-p",
      "--model",
      "claude-opus-5-5",
      "--effort",
      "high",
      "--tools",
      "",
      "--output-format",
      "json",
      "--json-schema",
      answerSchema,
    ],
    answerOf: (output: string) => claudeResultSchema.parse(JSON.parse(output)),
  },
  "gpt-sol-6.1": {
    command: "codex",
    // codex exec writes its last message, the answer's JSON, to the -o file.
    savesStdout: false,
    args: ({ answerPath }: HarnessFiles) => [
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--ephemeral",
      "-m",
      "gpt-6.1-sol",
      "-c",
      "model_reasoning_effort=high",
      "-s",
      "read-only",
      "--output-schema",
      ANSWER_SCHEMA_PATH,
      "-o",
      answerPath,
      "-",
    ],
    answerOf: (output: string): unknown => JSON.parse(output),
  },
} as const;

export type LabelerName = keyof typeof LABELERS;

export function isLabelerName(name: string): name is LabelerName {
  return Object.hasOwn(LABELERS, name);
}

export function setFolderName(set: number): string {
  return `set-${String(set).padStart(2, "0")}`;
}

// The labeler's prompt: the rubric, then the turn's judge input. The judge gets the
// same text in step 8.
export function labelPromptOf(rubric: string, judgeInput: string): string {
  return `${rubric.trim()}\n\n## The conversation\n\n${judgeInput.trim()}\n`;
}

// Runs the labeler on each turn in the set that has no answer yet, and saves what its
// harness printed. An answer already there is kept, so a run cut off partway can go on.
export function runLabeler(
  labeler: LabelerName,
  set: number,
  spanIds: string[],
  rubric: string,
): void {
  const answersDir = join(LABELING_DIR, setFolderName(set), labeler);
  mkdirSync(answersDir, { recursive: true });
  writeFileSync(ANSWER_SCHEMA_PATH, labelAnswerJsonSchema());
  const { command, args, savesStdout } = LABELERS[labeler];
  for (const spanId of spanIds) {
    const answerPath = join(answersDir, `${spanId}.txt`);
    if (existsSync(answerPath)) {
      continue;
    }
    const input = readFileSync(
      join(INPUTS_DIR, setFolderName(set), `${spanId}.md`),
      "utf8",
    );
    console.log(`${labeler}: labeling ${spanId}`);
    const run = spawnSync(
      command,
      args({ answerSchema: labelAnswerJsonSchema(), answerPath }),
      {
        cwd: LABELING_DIR,
        input: labelPromptOf(rubric, input),
        encoding: "utf8",
        env: harnessEnv(),
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (run.status !== 0) {
      throw new Error(`${labeler} failed on ${spanId}: ${run.stderr}`);
    }
    // Codex's log shows each command it ran, to check it read nothing else.
    writeFileSync(
      savesStdout ? answerPath : join(answersDir, `${spanId}.log`),
      savesStdout ? run.stdout : `${run.stdout}${run.stderr}`,
    );
  }
}

// Reads and checks the labeler's answer for each turn in the set.
export function readAnswers(
  labeler: LabelerName,
  set: number,
  spanIds: string[],
): Map<string, LabelAnswer> {
  const answersDir = join(LABELING_DIR, setFolderName(set), labeler);
  return new Map(
    spanIds.map((spanId) => {
      const output = readFileSync(join(answersDir, `${spanId}.txt`), "utf8");
      return [
        spanId,
        labelAnswerSchema.parse(LABELERS[labeler].answerOf(output)),
      ];
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
