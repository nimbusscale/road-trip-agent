import { describe, expect, it } from "vitest";

import type { CorpusSession } from "../grounded-eval/corpus-turn.js";
import { labelerInputOf, turnInputOf } from "./labeler-input.js";
import {
  replayExampleOf,
  type ReplayExample,
  TRIAL_SPLIT,
  withTrialSplit,
} from "./replay-cases.js";
import type { GoldenTurn } from "./saving-files.schema.js";
import type { TurnBefore } from "./turn-before.js";

const BEFORE: TurnBefore = {
  sessionTitle: "Bar Harbor",
  turn: 3,
  turnsInSession: 4,
  briefLines: ["mustSeesText: (not set)"],
  itineraryLines: ["Day 1: Natick to Bar Harbor"],
  memory: [],
};

const SESSION: CorpusSession = {
  sessionId: "agent-session",
  turns: [
    {
      spanId: "turn-1",
      traceId: "trace-1",
      userMessage: "A trip to Bar Harbor.",
      toolResults: [],
      reply: "When?",
    },
    {
      spanId: "turn-2",
      traceId: "trace-2",
      userMessage: "Maybe whale watching.",
      toolResults: [
        {
          tool: "update_trip_brief",
          worker: null,
          refused: false,
          input: '{"mustSeesText":"Maybe whale watching"}',
          text: "Updated the trip brief.",
        },
      ],
      reply: "Saved.",
    },
  ],
};

const ITEM = {
  turn: { set: 2, sessionId: "agent-session", spanId: "turn-2" },
  session: SESSION,
  before: BEFORE,
};

function goldenOf(labelerInput: string): GoldenTurn {
  return {
    set: 2,
    item: 4,
    spanId: "turn-2",
    labelerInput,
    expected: [
      { n: 1, tool: "update_trip_brief", checks: ["F5"] },
      { n: 2, tool: "add_memory_item", checks: ["F2", "F5"] },
    ],
  };
}

describe("replayExampleOf", () => {
  it("gives the judge the golden turn's input up to its turn, so a run's own turn completes it", () => {
    const labelerInput = labelerInputOf(SESSION, "turn-2", BEFORE);
    const example = replayExampleOf(goldenOf(labelerInput), ITEM);
    const turn = SESSION.turns[1];

    expect(turn).toBeDefined();
    expect(
      `${example.input.judgeContext}\n\n${turn === undefined ? "" : turnInputOf(turn)}`,
    ).toBe(labelerInput);
    expect(example.input).toMatchObject({
      agentSessionId: "agent-session",
      turn: 3,
    });
  });

  it("lists every check the golden turn's saves fail, once each", () => {
    const labelerInput = labelerInputOf(SESSION, "turn-2", BEFORE);

    expect(
      replayExampleOf(goldenOf(labelerInput), ITEM).output.originalChecks,
    ).toEqual(["F2", "F5"]);
  });

  it("refuses a case whose trip before the turn isn't what its golden input shows", () => {
    const changed = { ...BEFORE, briefLines: ["mustSeesText: Portland"] };
    const labelerInput = labelerInputOf(SESSION, "turn-2", changed);

    expect(() => replayExampleOf(goldenOf(labelerInput), ITEM)).toThrow(
      "isn't what its golden input shows",
    );
  });
});

describe("withTrialSplit", () => {
  function exampleOf(item: number, sessionId: string): ReplayExample {
    return {
      input: {
        goldenSpanId: "",
        agentSessionId: sessionId,
        turn: 1,
        judgeContext: "",
      },
      output: { originalChecks: [] },
      metadata: { set: 1, item, sessionId },
      splits: [],
    };
  }

  it("puts the first case of each of the first 3 sessions in the trial", () => {
    const examples = withTrialSplit([
      exampleOf(1, "a"),
      exampleOf(2, "a"),
      exampleOf(3, "b"),
      exampleOf(4, "c"),
      exampleOf(5, "d"),
    ]);

    expect(
      examples
        .filter((e) => e.splits.includes(TRIAL_SPLIT))
        .map((e) => e.metadata.item),
    ).toEqual([1, 3, 4]);
  });
});
