import { describe, expect, it } from "vitest";

import {
  passes,
  passesChecks,
  replayReportOf,
  replayScoreOf,
  savedNothing,
} from "./replay-score.js";
import type { SavingAnswer, SavingCheck } from "./saving-answer.schema.js";

function answerOf(...saves: SavingCheck[][]): SavingAnswer {
  return {
    saves: saves.map((checks, index) => ({
      n: index + 1,
      failures: checks.map((check) => ({ check, quote: "q", why: "w" })),
    })),
  };
}

describe("replayScoreOf", () => {
  it("lists the checks any save fails, once each, in check order", () => {
    const score = replayScoreOf(answerOf(["F5"], [], ["F2", "F5"]));
    expect(score).toEqual({ saves: 3, failing: ["F2", "F5"] });
    expect(passes(score)).toBe(false);
  });

  it("passes a run whose saves fail no check", () => {
    expect(passes(replayScoreOf(answerOf([], [])))).toBe(true);
  });

  it("passes a run that saved nothing, and counts it as saving nothing", () => {
    const score = replayScoreOf({ saves: [] });
    expect(passes(score)).toBe(true);
    expect(savedNothing(score)).toBe(true);
  });

  it("passes the golden turn's checks when the mistake moved to another check", () => {
    const score = replayScoreOf(answerOf(["F2"]));
    expect(passesChecks(score, ["F5"])).toBe(true);
    expect(passesChecks(score, ["F5", "F2"])).toBe(false);
  });
});

describe("replayReportOf", () => {
  it("counts a failed run apart from the judged ones", () => {
    const report = replayReportOf("Baseline", [
      {
        set: 2,
        item: 4,
        originalChecks: ["F5"],
        runs: [
          { score: replayScoreOf(answerOf(["F5"])) },
          { score: replayScoreOf(answerOf(["F2"])) },
          { score: replayScoreOf({ saves: [] }) },
          { error: "The turn failed: the plan's limit" },
        ],
      },
    ]);
    expect(report).toContain(
      "1 cases, 4 runs: 3 judged, 1 failed. Of the judged runs, 1 passed, 2 passed the checks their golden turn failed, and 1 saved nothing.",
    );
    expect(report).toContain("| 2.4 | F5 | 3 | 1 | 1 | 2 | 1 | F2 1, F5 1 |");
    expect(report).toContain("| F5 | 1 | 1 | 1 of 3 |");
    expect(report).toContain("- 2.4: The turn failed: the plan's limit");
  });
});
