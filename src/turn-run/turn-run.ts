import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { CoordinatorTurns } from "../agent/coordinator-turns.js";
import { coordinatorAccessFor } from "../agent/coordinator-access.js";
import { sdkTurnRunner } from "../agent/coordinator.js";
import type { TurnEvent } from "../agent/turn-event.js";
import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { newId } from "../ids/new-id.js";
import type { Queryable } from "../persistence/queryable.js";
import { SessionRepository } from "../persistence/session-repository.js";
import { Session } from "../persistence/session.js";
import { TranscriptRepository } from "../persistence/transcript-repository.js";
import { inTransaction } from "../persistence/transaction.js";
import { tripVersionWriterFor } from "../persistence/trip-version-writer.js";
import { copiedLine, recordedTurnStart } from "./recorded-turn.js";
import {
  RecordedSessionRepository,
  RunTripRepository,
} from "./turn-run-repositories.js";
import type { TranscriptRow, VersionRow } from "./turn-run.schema.js";

// A run from one turn of a recorded session, on today's code (#245). It reads the
// session from the live database, and writes nothing there. It copies the transcript
// before the turn, and the turn's trip version, into the local database, for a new test
// user, trip, and session. Then it runs the turn as npm run chat does, and its trace
// goes to Phoenix, as any local turn's does. Each run's rows stay in the local database.

export interface TurnRunGiven {
  env: Env;
  settings: Settings;
  // The app's environment, which the Claude Code process starts from.
  processEnv: Readonly<Record<string, string | undefined>>;
  localPool: Pool;
  livePool: Pool;
  // The commit of the code that ran, from appCommit().
  commit: string;
}

// The recorded turn to run: its agent session, its turn number from 1, as its trip
// version counts it, and the message to send, or null for the recorded one.
export interface RecordedTurnRef {
  agentSessionId: string;
  turn: number;
  message: string | null;
}

export interface TurnRun {
  userId: string;
  tripId: string;
  sessionId: string;
  agentSessionId: string;
  // The coordinator.turn span's ID, or null if the turn failed before it started.
  spanId: string | null;
  reply: string;
  // Why the turn failed, from its "ended" event, or null when it ended well.
  failure: string | null;
}

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

// Runs the turn, and hands each of its events to onEvent as it comes.
export async function runRecordedTurn(
  given: TurnRunGiven,
  ref: RecordedTurnRef,
  onEvent: (event: TurnEvent) => void,
): Promise<TurnRun> {
  const recorded = await readRecordedTurn(given.livePool, ref);
  const run = await copyToLocal(given.localPool, recorded);
  const result: TurnRun = {
    userId: run.userId,
    tripId: run.session.tripId,
    sessionId: run.session.id,
    agentSessionId: run.session.agentSessionId,
    spanId: null,
    reply: "",
    failure: null,
  };
  const text = ref.message ?? recorded.version.userMessage;
  const reply: string[] = [];
  for await (const event of await startTurn(given, run, recorded, text)) {
    if (event.kind === "traced") {
      result.spanId = event.spanId;
    } else if (event.kind === "text") {
      reply.push(event.text);
    } else if (event.kind === "ended") {
      result.failure = event.failure;
    }
    onEvent(event);
  }
  result.reply = reply.join("\n\n");
  return result;
}

async function readRecordedTurn(
  pool: Queryable,
  ref: RecordedTurnRef,
): Promise<RecordedTurn> {
  const live = new RecordedSessionRepository(pool);
  const session = await live.session(ref.agentSessionId);
  const version = await live.version(session.id, ref.turn);
  const rows = await live.transcriptRows(ref.agentSessionId);
  const { rowsBefore, appLines } = recordedTurnStart(
    rows,
    ref.turn,
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

// Starts the turn through the same code as npm run chat, with today's instructions and
// tools. The app's clock starts at the recorded turn's start, and runs on from there, so
// rules that use today's date see the recorded day (technical spec 5.2).
async function startTurn(
  given: TurnRunGiven,
  run: Run,
  recorded: RecordedTurn,
  text: string,
): Promise<AsyncIterable<TurnEvent>> {
  const startedAt = Date.now();
  const recordedStart = recorded.version.savedDateTime.getTime();
  const now = (): Date => new Date(recordedStart + Date.now() - startedAt);
  const coordinator = coordinatorAccessFor({
    env: given.env,
    pool: given.localPool,
    settings: given.settings,
    processEnv: given.processEnv,
    now,
  });
  const turns = new CoordinatorTurns({
    coordinator,
    runTurn: sdkTurnRunner(given.commit),
    versions: tripVersionWriterFor(given.localPool),
    now,
  });
  turns.markRecorded(run.session.id, recorded.appLines);
  const turn = await turns.begin(
    { session: run.session, userId: run.userId },
    { text, optionCard: null },
  );
  return turn.events();
}
