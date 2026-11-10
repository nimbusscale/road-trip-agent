import type { CorpusSession } from "../grounded-eval/corpus-turn.js";
import { byHash } from "../grounded-eval/sample.js";

// The coordinator's calls that save what the user said to the trip brief or to memory
// (#209). Forgetting an item isn't saving one, so forget_memory_item isn't here.
export const SAVE_TOOLS: ReadonlySet<string> = new Set([
  "update_trip_brief",
  "add_memory_item",
  "update_memory_item",
]);

export const SET_SIZE = 10;

// One turn to read: its coordinator.turn span, its session, and which set of 10 it's
// read in, from 1.
export interface SaveTurn {
  set: number;
  sessionId: string;
  spanId: string;
}

// Every corpus turn where the coordinator called a save tool. A refused call counts,
// since it still shows where the coordinator chose to save. The order mixes the
// sessions, so the first sets cover many trips. It comes from a hash of the seed and
// each span ID, so the same corpus and seed always give the same sets.
export function saveTurnsOf(
  sessions: readonly CorpusSession[],
  seed: string,
): SaveTurn[] {
  const found = sessions.flatMap((session) =>
    session.turns.flatMap((turn) =>
      turn.toolResults.some(
        (result) => result.worker === null && SAVE_TOOLS.has(result.tool),
      )
        ? [{ sessionId: session.sessionId, spanId: turn.spanId }]
        : [],
    ),
  );
  return byHash(found, seed).map((turn, index) => ({
    set: Math.floor(index / SET_SIZE) + 1,
    ...turn,
  }));
}
