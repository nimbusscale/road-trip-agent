import { describe, expect, it } from "vitest";

import { comparisonOf, labeledSavesOf, type SaveRef } from "./label-compare.js";
import type { SavingAnswer, SavingCheck } from "./saving-answer.schema.js";

const MEMORY_SAVE: SaveRef = {
  set: 1,
  item: 1,
  spanId: "span-a",
  n: 1,
  tool: "add_memory_item",
};
const BRIEF_SAVE: SaveRef = { ...MEMORY_SAVE, n: 2, tool: "update_trip_brief" };

function answer(checksBySave: SavingCheck[][]): SavingAnswer {
  return {
    saves: checksBySave.map((checks, index) => ({
      n: index + 1,
      failures: checks.map((check) => ({
        check,
        quote: `quote for ${check}`,
        why: "",
      })),
    })),
  };
}

describe("comparisonOf", () => {
  const labeled = labeledSavesOf(
    [MEMORY_SAVE, BRIEF_SAVE],
    {
      first: new Map([["span-a", answer([["F1", "F2"], []])]]),
      second: new Map([["span-a", answer([["F1"], ["F5"]])]]),
    },
    {
      turns: [
        {
          set: 1,
          spanId: "span-a",
          saves: [
            { n: 1, tool: "add_memory_item", checks: ["F2"], note: "" },
            { n: 2, tool: "update_trip_brief", checks: [], note: "" },
          ],
        },
      ],
    },
  );

  it("counts each check that fits a save, and lists each split", () => {
    const comparison = comparisonOf(labeled, "first", "second");
    expect(comparison.savesAgreed).toBe(0);
    expect(comparison.tallies).toEqual([
      { check: "F1", both: 1, onlyFirst: 0, onlySecond: 0, neither: 0 },
      { check: "F2", both: 0, onlyFirst: 1, onlySecond: 0, neither: 0 },
      { check: "F3", both: 0, onlyFirst: 0, onlySecond: 0, neither: 1 },
      { check: "F4", both: 0, onlyFirst: 0, onlySecond: 0, neither: 1 },
      { check: "F5", both: 0, onlyFirst: 0, onlySecond: 1, neither: 0 },
      { check: "F6", both: 0, onlyFirst: 0, onlySecond: 0, neither: 1 },
    ]);
    expect(
      comparison.splits.map(({ save, check, failsFor, quote }) => [
        save.n,
        check,
        failsFor,
        quote,
      ]),
    ).toEqual([
      [1, "F2", "first", "quote for F2"],
      [2, "F5", "second", "quote for F5"],
    ]);
  });

  it("compares a labeler with Joe's labels from the calibration file", () => {
    const comparison = comparisonOf(labeled, "joe", "second");
    expect(
      comparison.splits.map(({ save, check, failsFor }) => [
        save.n,
        check,
        failsFor,
      ]),
    ).toEqual([
      [1, "F2", "joe"],
      [1, "F1", "second"],
      [2, "F5", "second"],
    ]);
  });
});
