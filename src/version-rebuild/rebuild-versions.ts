// One-time job: rebuilds the trip versions of a session recorded before versions were
// saved (#244). It reads the session from the live database, through the SSH tunnel to
// the server's Postgres, replays it through today's code in the local database, and
// can then add the versions to the live session.
//
// npm run rebuild-versions -- <agent session ID> --report <file>
//   [--choices <file>]   Claude's choices where code can't decide (rebuild-input.schema.ts)
//   [--write-live]       adds the versions to the live database, once the report is sorted
//
// The live database's port, user, password, and name come from LIVE_POSTGRES_PORT,
// LIVE_POSTGRES_USER, LIVE_POSTGRES_PASSWORD, and LIVE_POSTGRES_DB. The report and the
// choices hold the session's data, so both stay outside the repo.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { Pool } from "pg";

import { turnMessageIndex } from "../agent/shown-messages.js";
import { parseEnv } from "../config/env.js";
import { livePoolConfigOf } from "../config/live-env.schema.js";
import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { createPool } from "../db/connection.js";
import { inTransaction } from "../persistence/transaction.js";
import { TripVersionRepository } from "../persistence/trip-version-repository.js";
import { jsonDifferences } from "./differences.js";
import { NO_CHOICES, rebuildChoicesSchema } from "./rebuild-input.schema.js";
import type { RebuildReport } from "./rebuild-report.js";
import {
  LiveSessionRepository,
  LocalRebuildRepository,
} from "./rebuild-repositories.js";
import {
  type LiveSession,
  newReplay,
  readLiveSession,
  startLocalTrip,
  tripWriterFor,
} from "./rebuild-setup.js";
import { type RecordedTurn, recordedTurnsOf } from "./recorded-calls.js";
import { type Replay, replayCall } from "./replay.js";

const ARGS = {
  report: { type: "string" },
  choices: { type: "string" },
  "write-live": { type: "boolean", default: false },
} as const;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: ARGS,
    allowPositionals: true,
  });
  const [agentSessionId] = positionals;
  if (agentSessionId === undefined || values.report === undefined) {
    throw new Error("Give the agent session ID, and --report <file>.");
  }
  const localPool = createPool(parseEnv(process.env));
  const livePool = new Pool(livePoolConfigOf(process.env));
  try {
    const liveRows = new LiveSessionRepository(livePool);
    const live = await readLiveSession(livePool, liveRows, agentSessionId);
    const turns = recordedTurnsOf(live.coordinatorLines, live.workerLines);
    const report = await rebuild(localPool, live, turns, values.choices);
    writeFileSync(values.report, report.text());
    console.log(report.summary().join("\n"));
    if (values["write-live"]) {
      await writeLive(livePool, localPool, live, turns.length);
    }
  } finally {
    await Promise.all([localPool.end(), livePool.end()]);
  }
}

// Replays every turn, saving each one's version first, as the app does (persistence
// design, section 8.9). Then compares the rebuilt trip with the live one.
async function rebuild(
  pool: Pool,
  live: LiveSession,
  turns: readonly RecordedTurn[],
  choicesPath: string | undefined,
): Promise<RebuildReport> {
  const env = parseEnv(process.env);
  const settings = loadSettings(SETTINGS_PATH);
  const clock = { at: live.session.createdDateTime };
  const writer = tripWriterFor(env, pool, settings, clock);
  await startLocalTrip(pool, writer, live, turns[0]?.startedAt ?? clock.at);
  const choices =
    choicesPath === undefined
      ? NO_CHOICES
      : rebuildChoicesSchema.parse(
          JSON.parse(readFileSync(choicesPath, "utf8")),
        );
  const replay = newReplay(pool, writer, settings, { live, clock, choices });
  const versions = new TripVersionRepository(pool);
  for (const turn of turns) {
    await versions.saveFrom({
      sessionId: live.session.id,
      turn: turn.turn,
      userMessage: turn.userMessage,
      savedDateTime: turn.startedAt,
      tripId: live.session.tripId,
      userId: live.trip.ownerId,
    });
    for (const call of turn.calls) {
      await replayCall(turn.turn, call, replay);
    }
  }
  await compareWithLive(replay, live);
  return replay.report;
}

async function compareWithLive(
  replay: Replay,
  live: LiveSession,
): Promise<void> {
  const { local, report } = replay;
  const { tripId } = live.session;
  const ownerId = live.trip.ownerId;
  // Keyed by ID, so a missing row shows as one difference.
  const wholes = (
    rows: readonly { id: string; whole: unknown }[],
  ): Record<string, unknown> =>
    Object.fromEntries(rows.map((row) => [row.id, row.whole]));
  const compared: [string, unknown, unknown][] = [
    ["Plan", live.trip.plan, (await local.trip(tripId)).plan],
    ["Places", wholes(live.places), wholes(await local.places(tripId))],
    [
      "Memory",
      wholes(live.memory),
      wholes(await local.memory(ownerId, tripId)),
    ],
  ];
  for (const [what, liveValue, rebuilt] of compared) {
    const differences = jsonDifferences(liveValue, rebuilt);
    report.add("final", null, null, [
      `${what}: live → rebuilt`,
      ...(differences.length > 0 ? differences : ["They match."]),
    ]);
  }
}

// Adds the rebuilt versions to the live session, then checks that turnMessageIndex()
// finds each one's turn in the live transcript.
async function writeLive(
  livePool: Pool,
  localPool: Pool,
  live: LiveSession,
  turnCount: number,
): Promise<void> {
  const sessionId = live.session.id;
  const versions = await new LocalRebuildRepository(localPool).versions(
    sessionId,
  );
  if (versions.length !== turnCount) {
    throw new Error(
      `The rebuild saved ${String(versions.length)} versions for ${String(turnCount)} turns.`,
    );
  }
  await inTransaction(livePool, (client) =>
    new LiveSessionRepository(client).addVersions(versions),
  );
  const written = await new LiveSessionRepository(livePool).versions(sessionId);
  for (const version of written) {
    turnMessageIndex(live.coordinatorLines, version.turn, version.userMessage);
  }
  console.log(
    `The live session has ${String(written.length)} versions, for its ${String(turnCount)} turns. turnMessageIndex() found each one's turn.`,
  );
}

await main();
