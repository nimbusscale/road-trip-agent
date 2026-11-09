import { randomUUID } from "node:crypto";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Pool } from "pg";

import { coordinatorAccessFor } from "../agent/coordinator-access.js";
import { runSoloWorker, soloWorkerOptions } from "../agent/solo-worker.js";
import type { WorkerType } from "../agent/worker-types.js";
import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { tripTimeZone } from "../domain/today.js";
import { newId } from "../ids/new-id.js";
import { COORDINATOR_KEY } from "../persistence/transcript-repository.js";
import { inTransaction } from "../persistence/transaction.js";
import {
  RecordedSessionRepository,
  RunTripRepository,
} from "../turn-run/turn-run-repositories.js";
import type { TranscriptRow, VersionRow } from "../turn-run/turn-run.schema.js";
import { NO_CHOICES } from "../version-rebuild/rebuild-input.schema.js";
import { RebuildReport } from "../version-rebuild/rebuild-report.js";
import {
  LiveSessionRepository,
  LocalRebuildRepository,
} from "../version-rebuild/rebuild-repositories.js";
import {
  replayTools,
  tripWriterFor,
} from "../version-rebuild/rebuild-setup.js";
import { SeenIds } from "../version-rebuild/recorded-ids.js";
import { type Replay, replayCall } from "../version-rebuild/replay.js";
import { type CandidateCalls, CandidateCallCount } from "./candidate-calls.js";
import { type RecordedWorker, recordedWorkerOf } from "./recorded-worker.js";
import { placeRowFor } from "./worker-run.schema.js";

// A run of one recorded worker on today's code (#266). It reads the recorded session
// from the live database, and writes nothing there. In the local database, it starts a
// new test user's trip from the turn's trip version, replays the turn's calls before the
// worker was sent, so the trip is as the worker found it, and then runs the worker on
// its recorded worker brief. Each run leaves its rows there.

export interface WorkerRunGiven {
  env: Env;
  settings: Settings;
  // The app's environment, which the Claude Code process starts from.
  processEnv: Readonly<Record<string, string | undefined>>;
  localPool: Pool;
  livePool: Pool;
  // The commit of the code that ran, from appCommit().
  commit: string;
}

export interface WorkerRun {
  workerType: WorkerType;
  turn: number;
  userId: string;
  tripId: string;
  spanId: string;
  // The replay's counts, and how many calls today's code handled differently, from
  // RebuildReport.summary(). Nothing from the trip itself.
  replay: string[];
  candidates: CandidateCalls;
}

// The replay's IDs come from a hook on newId() that lasts the whole replay, so two
// replays at once would take each other's IDs. Runs of the worker itself can overlap.
let replays: Promise<unknown> = Promise.resolve();

export async function runRecordedWorker(
  given: WorkerRunGiven,
  recorded: { agentSessionId: string; agentToolUseId: string },
  onMessage: (message: SDKMessage) => void = () => undefined,
): Promise<WorkerRun> {
  const live = await readLive(given.livePool, recorded);
  const run = { userId: randomUUID(), tripId: newId("trip") };
  const replaying = replays.then(() => startRunTrip(given, live, run));
  replays = replaying.catch(() => undefined);
  const report = await replaying;
  const access = coordinatorAccessFor({
    env: given.env,
    pool: given.localPool,
    settings: given.settings,
    processEnv: given.processEnv,
    now: clockFrom(live.worker.sentAt),
  });
  const trip = await access.trip.reader.read(run.tripId);
  const { workerType, workerBrief, turn } = live.worker;
  const options = soloWorkerOptions(access, {
    workerType,
    ...run,
    timeZone: tripTimeZone(trip.itinerary.startPlace),
  });
  const count = new CandidateCallCount();
  const spanId = await runSoloWorker(
    workerBrief,
    options,
    { workerType, userId: run.userId, commit: given.commit },
    (message) => {
      count.record(message);
      onMessage(message);
    },
  );
  return {
    workerType,
    turn,
    ...run,
    spanId,
    replay: report.summary(),
    candidates: count.counted,
  };
}

// The recorded session, as the live database holds it.
interface LiveWorker {
  worker: RecordedWorker;
  version: VersionRow;
  liveTripId: string;
  liveOwnerId: string;
}

async function readLive(
  pool: Pool,
  recorded: { agentSessionId: string; agentToolUseId: string },
): Promise<LiveWorker> {
  const sessions = new RecordedSessionRepository(pool);
  const session = await sessions.session(recorded.agentSessionId);
  const rows = await sessions.transcriptRows(recorded.agentSessionId);
  const worker = recordedWorkerOf(
    linesOf(rows, COORDINATOR_KEY),
    workerLinesOf(rows),
    recorded.agentToolUseId,
  );
  const trip = await new LiveSessionRepository(pool).trip(session.tripId);
  return {
    worker,
    version: await sessions.version(session.id, worker.turn),
    liveTripId: session.tripId,
    liveOwnerId: trip.ownerId,
  };
}

function linesOf(rows: readonly TranscriptRow[], workerKey: string): unknown[] {
  return rows
    .filter((row) => row.workerKey === workerKey)
    .map(({ line }) => line);
}

function workerLinesOf(rows: readonly TranscriptRow[]): Map<string, unknown[]> {
  const keys = new Set(rows.map((row) => row.workerKey));
  keys.delete(COORDINATOR_KEY);
  return new Map([...keys].map((key) => [key, linesOf(rows, key)]));
}

// Adds the run's trip from the turn's version, as a run from a recorded turn does, then
// replays each call before the worker was sent, at the time it was made (persistence
// design, section 8.9).
async function startRunTrip(
  given: WorkerRunGiven,
  live: LiveWorker,
  run: { userId: string; tripId: string },
): Promise<RebuildReport> {
  const { localPool } = given;
  await inTransaction(localPool, (client) =>
    new RunTripRepository(client).addTrip(
      { id: run.tripId, ownerId: run.userId },
      live.version,
    ),
  );
  const replay = await runReplay(given, live, run);
  for (const call of live.worker.callsBefore) {
    await replayCall(live.worker.turn, call, replay);
  }
  return replay.report;
}

async function runReplay(
  given: WorkerRunGiven,
  live: LiveWorker,
  run: { userId: string; tripId: string },
): Promise<Replay> {
  const { env, settings, localPool, livePool } = given;
  const clock = { at: live.version.savedDateTime };
  const writer = tripWriterFor(env, localPool, settings, clock);
  const liveRows = new LiveSessionRepository(livePool);
  const places = await liveRows.places(live.liveTripId);
  const memory = await liveRows.memory(live.liveOwnerId, live.liveTripId);
  // Every ID the trip holds at the turn's start, so no reply counts one as made by its
  // call.
  const seen = new SeenIds();
  seen.see(JSON.stringify(live.version));
  return {
    ...run,
    ownerId: run.userId,
    tools: replayTools(localPool, writer, settings, { ...run, clock }),
    clock,
    seen,
    local: new LocalRebuildRepository(localPool),
    // A search before the worker was sent saved places, which come from the live trip's
    // rows, as in the rebuild, moved to the run's trip.
    livePlaces: new Map(
      places.map((place) => [place.id, placeRowFor(place, run.tripId)]),
    ),
    liveMemory: new Map(memory.map((item) => [item.id, item])),
    choices: NO_CHOICES,
    checksNotRun: new Map(),
    report: new RebuildReport(),
  };
}

// The app's clock starts when the worker was sent, and runs on from there, so the tools'
// rules that use today's date see the recorded day, as in a run from a recorded turn.
function clockFrom(start: Date): () => Date {
  const startedAt = Date.now();
  return () => new Date(start.getTime() + Date.now() - startedAt);
}
