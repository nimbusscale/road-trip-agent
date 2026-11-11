// Dev only: starts a run from one turn of a recorded session, and runs that turn on
// today's code, for an agent evaluation (#245). turn-run.ts says what a run does.
//
// npm run run-turn -- <agent session ID> <turn> --recorded-message
// npm run run-turn -- <agent session ID> <turn> --message "<new text>"
//
// The live database's port, user, password, and name come from LIVE_POSTGRES_PORT,
// LIVE_POSTGRES_USER, LIVE_POSTGRES_PASSWORD, and LIVE_POSTGRES_DB. Each run's rows stay
// in the local database, so a scorer can read what the turn saved.
import { parseArgs } from "node:util";

import { Pool } from "pg";

import type { TurnEvent } from "../agent/turn-event.js";
import { parseEnv } from "../config/env.js";
import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { appCommit } from "../tracing/app-commit.js";
import { startTracing } from "../tracing/phoenix.js";
import { runRecordedTurn } from "./turn-run.js";

const ARGS = {
  "recorded-message": { type: "boolean", default: false },
  message: { type: "string" },
} as const;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: ARGS,
    allowPositionals: true,
  });
  const [agentSessionId, turnText] = positionals;
  const turn = Number(turnText);
  if (agentSessionId === undefined || !Number.isInteger(turn) || turn < 1) {
    throw new Error("Give the agent session ID, and the turn's number from 1.");
  }
  if (values["recorded-message"] === (values.message !== undefined)) {
    throw new Error('Give one of --recorded-message or --message "<text>".');
  }
  const env = parseEnv(process.env);
  const localPool = createPool(env);
  const livePool = new Pool(livePoolConfigOf(process.env));
  const tracing = startTracing(env);
  try {
    const run = await runRecordedTurn(
      {
        env,
        settings: loadSettings(SETTINGS_PATH),
        processEnv: process.env,
        localPool,
        livePool,
        commit: appCommit(env.appCommit),
      },
      { agentSessionId, turn, message: values.message ?? null },
      printEvent,
    );
    console.log(`\nUser ${run.userId}`);
    console.log(`Trip ${run.tripId}`);
    console.log(`Session ${run.sessionId}`);
    console.log(`Agent session ${run.agentSessionId}`);
    console.log(`\nThe reply:\n\n${run.reply}`);
  } finally {
    await Promise.all([localPool.end(), livePool.end()]);
    await tracing.shutdown();
  }
}

function printEvent(event: TurnEvent): void {
  switch (event.kind) {
    case "traced":
      console.log(`Turn span ${event.spanId}`);
      break;
    case "toolCall":
      console.log(`  [tool] ${event.name} ${JSON.stringify(event.input)}`);
      break;
    case "ended":
      if (event.failure !== null) {
        console.error(`The turn failed: ${event.failure}`);
      }
      break;
    default:
      break;
  }
}

await main();
