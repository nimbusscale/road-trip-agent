import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { RoutesClient } from "../google/routes-client.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import {
  COORDINATOR_KEY,
  TranscriptRepository,
} from "../persistence/transcript-repository.js";
import { TripReader } from "../persistence/trip-reader.js";
import { TripRepository } from "../persistence/trip-repository.js";
import { SYSTEM_CLOCK, TripWriter } from "../persistence/trip-writer.js";
import {
  MEMORY_SERVER_NAME,
  memoryAccessFor,
  memoryTools,
} from "../tools/memory-server.js";
import type { StrictToolDefinition } from "../tools/strict-tool.js";
import { TRIP_SERVER_NAME, tripTools } from "../tools/trip-server.js";
import {
  type LiveSessionRepository,
  LocalRebuildRepository,
  type MemoryRow,
  type PlaceRow,
  type SessionRow,
  type TripRow,
} from "./rebuild-repositories.js";
import type { RebuildChoices } from "./rebuild-input.schema.js";
import { RebuildReport } from "./rebuild-report.js";
import { SeenIds, withIds } from "./recorded-ids.js";
import type { Replay, ReplayClock } from "./replay.js";

// One session as the live database holds it now (#244).
export interface LiveSession {
  readonly session: SessionRow;
  readonly trip: TripRow;
  readonly places: readonly PlaceRow[];
  readonly memory: readonly MemoryRow[];
  readonly coordinatorLines: readonly unknown[];
  readonly workerLines: ReadonlyMap<string, readonly unknown[]>;
}

export async function readLiveSession(
  pool: Queryable,
  live: LiveSessionRepository,
  agentSessionId: string,
): Promise<LiveSession> {
  const session = await live.session(agentSessionId);
  // The rebuild starts from an empty trip, so the session has to be its trip's only one.
  if ((await live.sessionCount(session.tripId)) !== 1) {
    throw new Error("The session's trip has other sessions.");
  }
  const trip = await live.trip(session.tripId);
  const transcripts = new TranscriptRepository(pool);
  const linesOf = (workerKey: string): Promise<unknown[]> =>
    transcripts.loadLines({ agentSessionId, workerKey });
  const workerLines = new Map<string, unknown[]>();
  for (const key of await transcripts.listWorkerKeys(agentSessionId)) {
    workerLines.set(key, await linesOf(key));
  }
  return {
    session,
    trip,
    places: await live.places(session.tripId),
    memory: await live.memory(trip.ownerId, session.tripId),
    coordinatorLines: await linesOf(COORDINATOR_KEY),
    workerLines,
  };
}

// What today's code writes the rebuilt trip with, running at the replay's clock.
export function tripWriterFor(
  env: Env,
  pool: Connectable & Queryable,
  settings: Settings,
  clock: ReplayClock,
): TripWriter {
  return new TripWriter({
    pool,
    storeFor: (connection) => new TripRepository(connection),
    settings,
    clock: {
      now: () => clock.at,
      pause: (milliseconds) => SYSTEM_CLOCK.pause(milliseconds),
    },
    routeFinder: new RoutesClient({ apiKey: env.googleMapsServerKey, fetch }),
  });
}

// Empties the local database of an earlier run, and starts the trip as it was before
// the session's first message: with the live trip's own IDs, the user memory saved
// before then, and the session's row, which its versions need.
export async function startLocalTrip(
  pool: Queryable,
  writer: TripWriter,
  live: LiveSession,
  firstTurnAt: Date,
): Promise<void> {
  const local = new LocalRebuildRepository(pool);
  const { session, trip, memory } = live;
  if (await local.hasTrip(session.tripId)) {
    await writer.deleteTrip(session.tripId);
  }
  await local.removeMemoryItems(
    trip.ownerId,
    memory.map((item) => item.id),
  );
  const userMemoryBefore = memory.filter(
    (item) => item.tripId === null && item.createdDateTime < firstTurnAt,
  );
  for (const item of userMemoryBefore) {
    await local.addRow("memory_items", item.whole);
  }
  if ((await local.userMemoryCount(trip.ownerId)) !== userMemoryBefore.length) {
    throw new Error(
      "The local database has other user memory for the trip's owner, which the versions would hold.",
    );
  }
  const ids = [session.tripId, trip.briefId, trip.itineraryId, trip.lastDayId];
  const started = await withIds(ids, () =>
    writer.startTrip({ id: trip.ownerId }),
  );
  if (started.unused.length > 0 || started.random.length > 0) {
    throw new Error("A new trip no longer makes the IDs the rebuild gives it.");
  }
  await local.addRow("sessions", session.whole);
}

// What the replay works with, at the start of the session's first turn.
export function newReplay(
  pool: Connectable & Queryable,
  writer: TripWriter,
  settings: Settings,
  given: { live: LiveSession; clock: ReplayClock; choices: RebuildChoices },
): Replay {
  const { live, clock, choices } = given;
  const { session, trip } = live;
  const seen = new SeenIds();
  // The new trip's own IDs, so no reply counts them as made by its call.
  seen.see(
    [session.tripId, trip.briefId, trip.itineraryId, trip.lastDayId].join(" "),
  );
  return {
    tripId: session.tripId,
    ownerId: trip.ownerId,
    tools: replayTools(pool, writer, settings, {
      tripId: session.tripId,
      userId: trip.ownerId,
      clock,
    }),
    clock,
    seen,
    local: new LocalRebuildRepository(pool),
    livePlaces: new Map(live.places.map((place) => [place.id, place])),
    liveMemory: new Map(live.memory.map((item) => [item.id, item])),
    choices,
    checksNotRun: new Map(
      choices.checksNotRunUntil.map((each) => [
        each.check,
        each.untilToolUseId,
      ]),
    ),
    report: new RebuildReport(),
  };
}

// Every trip and memory tool, by its name as the model sees it, for the trip and the
// user whose memory it reads.
export function replayTools(
  pool: Connectable & Queryable,
  writer: TripWriter,
  settings: Settings,
  given: { tripId: string; userId: string; clock: ReplayClock },
): Map<string, StrictToolDefinition> {
  const { tripId, userId, clock } = given;
  const trip = tripTools({
    tripId,
    writer,
    reader: new TripReader(
      pool,
      (connection) => new TripRepository(connection),
    ),
    settings,
    now: () => clock.at,
  });
  const memory = memoryTools({
    ...memoryAccessFor({ pool, settings, now: () => clock.at }),
    userId,
    tripId,
  });
  return new Map([
    ...trip.map(
      (tool) => [`mcp__${TRIP_SERVER_NAME}__${tool.name}`, tool] as const,
    ),
    ...memory.map(
      (tool) => [`mcp__${MEMORY_SERVER_NAME}__${tool.name}`, tool] as const,
    ),
  ]);
}
