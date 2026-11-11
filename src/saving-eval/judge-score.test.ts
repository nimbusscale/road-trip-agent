import { describe, expect, it } from "vitest";

import {
  checkCountsOf,
  type ExpectedSave,
  judgeDiffsOf,
} from "./judge-score.js";
import type { SavingAnswer, SavingCheck } from "./saving-answer.schema.js";

const EXPECTED: ExpectedSave[] = [
  { n: 1, tool: "add_memory_item", checks: ["F1", "F2"] },
  { n: 2, tool: "update_trip_brief", checks: [] },
];

function answer(checksBySave: SavingCheck[][]): SavingAnswer {
  return {
    saves: checksBySave.map((checks, index) => ({
      n: index + 1,
      failures: checks.map((check) => ({
        check,
        quote: `q ${check}`,
        why: "w",
      })),
    })),
  };
}

describe("judgeDiffsOf", () => {
  it("finds a miss and a false alarm, save by save", () => {
    const diffs = judgeDiffsOf(EXPECTED, answer([["F1"], ["F5"]]));
    expect(diffs).toEqual([
      {
        n: 1,
        tool: "add_memory_item",
        check: "F2",
        kind: "miss",
        quote: "",
        why: "",
      },
      {
        n: 2,
        tool: "update_trip_brief",
        check: "F5",
        kind: "false alarm",
        quote: "q F5",
        why: "w",
      },
    ]);
  });

  it("counts a check the judge fails twice on one save once", () => {
    const twice: SavingAnswer = {
      saves: [
        {
          n: 1,
          failures: [
            { check: "F1", quote: "a", why: "" },
            { check: "F2", quote: "b", why: "" },
            { check: "F2", quote: "c", why: "" },
          ],
        },
        { n: 2, failures: [] },
      ],
    };
    expect(judgeDiffsOf(EXPECTED, twice)).toEqual([]);
  });

  it("refuses an answer that skips a save", () => {
    expect(() => judgeDiffsOf(EXPECTED, answer([["F1", "F2"]]))).toThrow(
      "one entry for each of the 2 saves",
    );
  });
});

describe("checkCountsOf", () => {
  it("adds up the labeled fails, misses, and false alarms for each check", () => {
    const judged = [answer([["F1"], ["F5"]]), answer([["F1", "F2"], []])].map(
      (a) => ({ expected: EXPECTED, diffs: judgeDiffsOf(EXPECTED, a) }),
    );
    const counts = checkCountsOf(judged);
    expect(counts.find((c) => c.check === "F2")).toEqual({
      check: "F2",
      labeled: 2,
      misses: 1,
      falseAlarms: 0,
    });
    expect(counts.find((c) => c.check === "F5")).toEqual({
      check: "F5",
      labeled: 0,
      misses: 0,
      falseAlarms: 1,
    });
  });
});
