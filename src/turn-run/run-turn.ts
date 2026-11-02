// Dev only: starts a run from one turn of a recorded session, and runs that turn on
// today's code, for an agent evaluation (#245). It reads the session from the live
// database, through the SSH tunnel to the server's Postgres. It copies the transcript
// before the turn, and the turn's trip version, into the local database, for a new test
// user, trip, and session. Then it runs the turn as npm run chat does, and its trace
// goes to Phoenix, as any local turn's does.
//
// npm run run-turn -- <agent session ID> <turn> --recorded-message
// npm run run-turn -- <agent session ID> <turn> --message "<new text>"
//
// The live database's port, user, password, and name come from LIVE_POSTGRES_PORT,
// LIVE_POSTGRES_USER, LIVE_POSTGRES_PASSWORD, and LIVE_POSTGRES_DB. Each run's rows stay
// in the local database, so a scorer can read what the turn saved.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { Pool } from "pg";

import { CoordinatorTurns } from "../agent/coordinator-turns.js";
import { coordinatorAccessFor } from "../agent/coordinator-access.js";
import { sdkTurnRunner } from "../agent/coordinator.js";
import type { TurnEvent } from "../agent/turn-event.js";
import { parseEnv } from "../config/env.js";
import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { newId } from "../ids/new-id.js";
import type { Queryable } from "../persistence/queryable.js";
import { SessionRepository } from "../persistence/session-repository.js";
import { Session } from "../persistence/session.js";
import { TranscriptRepository } from "../persistence/transcript-repository.js";
import { inTransaction } from "../persistence/transaction.js";
import { tripVersionWriterFor } from "../persistence/trip-version-writer.js";
import { appCommit } from "../tracing/app-commit.js";
import { startTracing } from "../tracing/phoenix.js";
import { copiedLine, recordedTurnStart } from "./recorded-turn.js";
import {
  RecordedSessionRepository,
  RunTripRepository,
} from "./turn-run-repositories.js";
import type { TranscriptRow, VersionRow } from "./turn-run.schema.js";

const ARGS = {
  "recorded-message": { type: "boolean", default: false },
  message: { type: "string" },
} as const;

// The recorded turn, as the live database holds it.
interface RecordedTurn {
  session: Session;
  version: VersionRow;
  rowsBefore: TranscriptRow[];
  appLines: string[];
}

// The run's new rows in the local database.
interface Run {
  session: Session;
  userId: string;
}

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
    const recorded = await readRecordedTurn(livePool, agentSessionId, turn);
    const run = await copyToLocal(localPool, recorded);
    console.log(`User ${run.userId}`);
    console.log(`Trip ${run.session.tripId}`);
    console.log(`Session ${run.session.id}`);
    console.log(`Agent session ${run.session.agentSessionId}`);
    const text = values.message ?? recorded.version.userMessage;
    await runTurn(localPool, run, recorded, text);
  } finally {
    await Promise.all([localPool.end(), livePool.end()]);
    await tracing.shutdown();
  }
}

async function readRecordedTurn(
  pool: Queryable,
  agentSessionId: string,
  turn: number,
): Promise<RecordedTurn> {
  const live = new RecordedSessionRepository(pool);
  const session = await live.session(agentSessionId);
  const version = await live.version(session.id, turn);
  const rows = await live.transcriptRows(agentSessionId);
  const { rowsBefore, appLines } = recordedTurnStart(
    rows,
    turn,
    version.userMessage,
  );
  return { session, version, rowsBefore, appLines };
}

// The trip version goes in as it is, with the recorded IDs inside it, since the copied
// conversation names them (persistence design, section 8.9). The session keeps its
// title and created time, which the coordinator never sees.
async function copyToLocal(pool: Pool, recorded: RecordedTurn): Promise<Run> {
  const userId = randomUUID();
  const session = new Session({
    id: newId("session"),
    tripId: newId("trip"),
    createdDateTime: recorded.session.createdDateTime,
    title: recorded.session.title,
    agentSessionId: randomUUID(),
  });
  const agentSessionIds = {
    recorded: recorded.session.agentSessionId,
    run: session.agentSessionId,
  };
  await inTransaction(pool, async (client) => {
    await new RunTripRepository(client).addTrip(
      { id: session.tripId, ownerId: userId },
      recorded.version,
    );
    await new SessionRepository(client).add(session);
    const transcripts = new TranscriptRepository(client);
    for (const { workerKey, rows } of runsByWorkerKey(recorded.rowsBefore)) {
      await transcripts.addLines(
        { agentSessionId: session.agentSessionId, workerKey },
        rows.map((row) => copiedLine(row.line, agentSessionIds)),
      );
    }
  });
  return { session, userId };
}

// Rows in a row from the same transcript, so the copy keeps the session's order across
// transcripts too.
function runsByWorkerKey(
  rows: readonly TranscriptRow[],
): { workerKey: string; rows: TranscriptRow[] }[] {
  const runs: { workerKey: string; rows: TranscriptRow[] }[] = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last?.workerKey === row.workerKey) {
      last.rows.push(row);
    } else {
      runs.push({ workerKey: row.workerKey, rows: [row] });
    }
  }
  return runs;
}

// Runs the turn through the same code as npm run chat, with today's instructions and
// tools. The app's clock starts at the recorded turn's start, and runs on from there, so
// rules that use today's date see the recorded day (technical spec 5.2).
async function runTurn(
  pool: Pool,
  run: Run,
  recorded: RecordedTurn,
  text: string,
): Promise<void> {
  const env = parseEnv(process.env);
  const startedAt = Date.now();
  const recordedStart = recorded.version.savedDateTime.getTime();
  const now = (): Date => new Date(recordedStart + Date.now() - startedAt);
  const coordinator = coordinatorAccessFor({
    env,
    pool,
    settings: loadSettings(SETTINGS_PATH),
    processEnv: process.env,
    now,
  });
  const turns = new CoordinatorTurns({
    coordinator,
    runTurn: sdkTurnRunner(appCommit(env.appCommit)),
    versions: tripVersionWriterFor(pool),
    now,
  });
  turns.markRecorded(run.session.id, recorded.appLines);
  const turn = await turns.begin(
    { session: run.session, userId: run.userId },
    { text, optionCard: null },
  );
  const reply: string[] = [];
  for await (const event of turn.events()) {
    printEvent(event, reply);
  }
  console.log(`\nThe reply:\n\n${reply.join("\n\n")}`);
}

function printEvent(event: TurnEvent, reply: string[]): void {
  switch (event.kind) {
    case "traced":
      console.log(`Turn span ${event.spanId}`);
      break;
    case "text":
      reply.push(event.text);
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
