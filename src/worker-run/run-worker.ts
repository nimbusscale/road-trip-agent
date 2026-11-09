// Dev only: runs one recorded worker run on today's code, on its own, for an agent
// evaluation (#266). The worker gets the worker brief the coordinator sent it, and the
// trip as it found it: the turn's trip version, with the turn's calls before the worker
// was sent replayed on it. Its trace goes to Phoenix, as a local turn's does, as a span
// named for the worker, such as stay-researcher.turn.
//
// npm run run-worker -- <agent session ID> <Agent tool_use ID>
//
// The tool_use ID is the coordinator's Agent call that started the worker, as its
// trace's Agent span shows it in tool_call.id. The live database's port, user,
// password, and name come from LIVE_POSTGRES_PORT, LIVE_POSTGRES_USER,
// LIVE_POSTGRES_PASSWORD, and LIVE_POSTGRES_DB. Each run's rows stay in the local
// database.
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Pool } from "pg";

import { turnEventsOf } from "../agent/turn-event.js";
import { parseEnv } from "../config/env.js";
import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { appCommit } from "../tracing/app-commit.js";
import { startTracing } from "../tracing/phoenix.js";
import { runRecordedWorker } from "./worker-run.js";

async function main(): Promise<void> {
  const [agentSessionId, agentToolUseId] = process.argv.slice(2);
  if (agentSessionId === undefined || agentToolUseId === undefined) {
    throw new Error(
      "Give the agent session ID, and the tool_use ID of the Agent call that started the worker.",
    );
  }
  const env = parseEnv(process.env);
  const localPool = createPool(env);
  const livePool = new Pool(livePoolConfigOf(process.env));
  const tracing = startTracing(env);
  try {
    const run = await runRecordedWorker(
      {
        env,
        settings: loadSettings(SETTINGS_PATH),
        processEnv: process.env,
        localPool,
        livePool,
        commit: appCommit(env.appCommit),
      },
      { agentSessionId, agentToolUseId },
      printMessage,
    );
    console.log(`\n${run.workerType}, from turn ${String(run.turn)}`);
    console.log(`User ${run.userId}`);
    console.log(`Trip ${run.tripId}`);
    console.log(`Span ${run.spanId}`);
    console.log(`The replay: ${run.replay.join("; ")}`);
    const { calls, refused, refusals } = run.candidates;
    console.log(
      `Candidate calls: ${String(calls)}, refused: ${String(refused)}`,
    );
    for (const refusal of refusals) {
      console.log(`\n${refusal.tool}:\n${refusal.reply}`);
    }
  } finally {
    await Promise.all([localPool.end(), livePool.end()]);
    await tracing.shutdown();
  }
}

function printMessage(message: SDKMessage): void {
  for (const event of turnEventsOf(message)) {
    if (event.kind === "toolCall") {
      console.log(`  [tool] ${event.name} ${JSON.stringify(event.input)}`);
    } else if (event.kind === "toolReply" && event.isError) {
      console.log(`  [refused] ${event.text.slice(0, 200)}`);
    } else if (event.kind === "ended" && event.failure !== null) {
      console.error(`The run failed: ${event.failure}`);
    }
  }
}

await main();
