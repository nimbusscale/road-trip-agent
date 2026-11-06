import { createHash } from "node:crypto";

import type { CorpusSession } from "./corpus-turn.js";

export const SET_SIZE = 5;

// One sampled turn: the coordinator.turn span to label, its session, and which set of
// 5 it's labeled in, from 1.
export interface SampledTurn {
  set: number;
  sessionId: string;
  spanId: string;
}

// Picks `size` turns from the corpus (#282). Each session gets one turn first. The rest
// are spread by each session's share of the turns not yet picked, rounded down, and the
// turns left go to the largest remainders. The pick within a session, and the order the
// sets are made in, come from a hash of the seed and each span ID. So the same corpus
// and seed always give the same sample. When there are more sessions than `size`,
// every session still gets one.
export function pickSample(
  sessions: CorpusSession[],
  size: number,
  seed: string,
): SampledTurn[] {
  const quotas = quotasOf(sessions, size);
  const picked = sessions.flatMap((session, index) =>
    byHash(
      session.turns.map((turn) => ({
        sessionId: session.sessionId,
        spanId: turn.spanId,
      })),
      `${seed}:pick`,
    ).slice(0, quotas[index]),
  );
  return byHash(picked, `${seed}:order`).map((turn, index) => ({
    set: Math.floor(index / SET_SIZE) + 1,
    ...turn,
  }));
}

function quotasOf(sessions: CorpusSession[], size: number): number[] {
  const extra = Math.max(0, size - sessions.length);
  const weights = sessions.map((session) => session.turns.length - 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map((weight) =>
    totalWeight === 0 ? 0 : (weight * extra) / totalWeight,
  );
  const quotas = shares.map((share) => 1 + Math.floor(share));
  const left = size - quotas.reduce((sum, quota) => sum + quota, 0);
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder.slice(0, Math.max(0, left))) {
    quotas[index] = (quotas[index] ?? 0) + 1;
  }
  return quotas;
}

function byHash<T extends { spanId: string }>(items: T[], salt: string): T[] {
  const keyOf = (item: T) =>
    createHash("sha256").update(`${salt}:${item.spanId}`).digest("hex");
  return [...items].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}
