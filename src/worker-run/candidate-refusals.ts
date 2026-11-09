// Dev only: the candidate refusals evaluation (#266). Its cases are
// evals/candidate-refusals/cases.json: the recorded worker runs that had a candidate
// call refused, each by its session and the Agent call that started it.
//
// npm run candidate-refusals -- dataset
//   Saves the cases as the candidate-refusals dataset in Phoenix, if it isn't there yet.
// npm run candidate-refusals -- experiment
//   Runs each case 5 times on today's code, with npm run run-worker's run, as a Phoenix
//   experiment. Its description is the last commit's subject line, so the subject should
//   say what the commit changed. It stops if there are uncommitted changes, since the
//   experiment would be named for a commit that isn't the code that ran.
//
// The experiment reads the live database, as npm run run-worker does, with the same
// LIVE_POSTGRES_* values.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { Pool } from "pg";

import { parseEnv } from "../config/env.js";
import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { appCommit } from "../tracing/app-commit.js";
import {
  runRefusalsExperiment,
  saveRefusalsDataset,
} from "./refusals-experiment.js";
import { refusalCasesSchema } from "./worker-run.schema.js";

const CASES_PATH = "evals/candidate-refusals/cases.json";

async function main(): Promise<void> {
  const [action] = process.argv.slice(2);
  const env = parseEnv(process.env);
  switch (action) {
    case "dataset": {
      const cases = refusalCasesSchema.parse(
        JSON.parse(readFileSync(CASES_PATH, "utf8")),
      );
      console.log(await saveRefusalsDataset(env.phoenixUrl, cases));
      return;
    }
    case "experiment":
      await experiment(env);
      return;
    default:
      throw new Error("Give an action: dataset or experiment.");
  }
}

async function experiment(env: ReturnType<typeof parseEnv>): Promise<void> {
  const commit = appCommit(env.appCommit);
  if (commit.endsWith("-dirty")) {
    throw new Error(
      "Commit the change first, so the experiment is named for the code that runs.",
    );
  }
  const subject = execFileSync("git", ["log", "-1", "--format=%s"], {
    encoding: "utf8",
  }).trim();
  const localPool = createPool(env);
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    await runRefusalsExperiment(
      env.phoenixUrl,
      {
        env,
        settings: loadSettings(SETTINGS_PATH),
        processEnv: process.env,
        localPool,
        livePool,
        commit,
      },
      subject,
    );
  } finally {
    await Promise.all([localPool.end(), livePool.end()]);
  }
}

await main();
