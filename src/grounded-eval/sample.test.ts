import { describe, expect, it } from "vitest";

import type { CorpusSession } from "./corpus-turn.js";
import { pickSample } from "./sample.js";

function sessionWith(sessionId: string, turnCount: number): CorpusSession {
  return {
    sessionId,
    turns: [...Array(turnCount).keys()].map((index) => ({
      spanId: `${sessionId}-${String(index)}`,
      traceId: `trace-${sessionId}-${String(index)}`,
      userMessage: "",
      toolResults: [],
      reply: "",
    })),
  };
}

// 60 turns in all, so a sample of 12 is one in five.
const SESSIONS = [
  sessionWith("big", 40),
  sessionWith("middle", 17),
  sessionWith("small", 2),
  sessionWith("tiny", 1),
];

describe("pickSample", () => {
  it("picks the size asked for, with every session in it", () => {
    const sample = pickSample(SESSIONS, 12, "seed");

    expect(sample).toHaveLength(12);
    expect(new Set(sample.map((turn) => turn.sessionId))).toEqual(
      new Set(["big", "middle", "small", "tiny"]),
    );
  });

  it("gives the rest of the sample by each session's share of the turns", () => {
    const counts = new Map<string, number>();
    for (const turn of pickSample(SESSIONS, 12, "seed")) {
      counts.set(turn.sessionId, (counts.get(turn.sessionId) ?? 0) + 1);
    }

    // After one each, the other 8 go by the turns left: 39, 16, 1, and 0 of 56.
    expect(Object.fromEntries(counts)).toEqual({
      big: 7,
      middle: 3,
      small: 1,
      tiny: 1,
    });
  });

  it("never picks a turn twice", () => {
    const sample = pickSample(SESSIONS, 12, "seed");

    expect(new Set(sample.map((turn) => turn.spanId)).size).toBe(12);
  });

  it("gives the same sample for the same seed, and another for a new one", () => {
    const first = pickSample(SESSIONS, 12, "seed");

    expect(pickSample(SESSIONS, 12, "seed")).toEqual(first);
    expect(pickSample(SESSIONS, 12, "another")).not.toEqual(first);
  });

  it("splits the sample into sets of 5, the last holding what's left", () => {
    const sets = pickSample(SESSIONS, 12, "seed").map((turn) => turn.set);

    expect(sets).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]);
  });
});
