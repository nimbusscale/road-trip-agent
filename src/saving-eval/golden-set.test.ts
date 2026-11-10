import { describe, expect, it } from "vitest";

import { settledTurnsOf } from "./golden-set.js";
import { labeledSavesOf, type SaveRef } from "./label-compare.js";
import type { SavingAnswer, SavingCheck } from "./saving-answer.schema.js";

const FIRST_SAVE: SaveRef = {
  set: 4,
  item: 2,
  spanId: "span-a",
  n: 1,
  tool: "add_memory_item",
};
const SECOND_SAVE: SaveRef = { ...FIRST_SAVE, n: 2 };

function answer(checksBySave: SavingCheck[][]): SavingAnswer {
  return {
    saves: checksBySave.map((checks, index) => ({
      n: index + 1,
      failures: checks.map((check) => ({ check, quote: "", why: "" })),
    })),
  };
}

// Save 1: the labelers agree on F1. Save 2: they split on F2.
const LABELERS = {
  first: new Map([["span-a", answer([["F1"], ["F2", "F3"]])]]),
  second: new Map([["span-a", answer([["F1"], ["F3"]])]]),
};

describe("settledTurnsOf", () => {
  it("takes Joe's call on a split, and the labelers' agreement on the rest", () => {
    const labeled = labeledSavesOf([FIRST_SAVE, SECOND_SAVE], LABELERS, {
      turns: [
        {
          set: 4,
          spanId: "span-a",
          saves: [{ n: 2, tool: "add_memory_item", checks: ["F3"], note: "" }],
        },
      ],
    });

    expect(settledTurnsOf(labeled, ["first", "second"])).toEqual([
      {
        set: 4,
        item: 2,
        spanId: "span-a",
        saves: [
          {
            n: 1,
            tool: "add_memory_item",
            checks: ["F1"],
            labelFrom: "labelers",
          },
          { n: 2, tool: "add_memory_item", checks: ["F3"], labelFrom: "joe" },
        ],
      },
    ]);
  });

  it("stops on a split Joe didn't call, and names the save and check", () => {
    const labeled = labeledSavesOf([FIRST_SAVE, SECOND_SAVE], LABELERS, {
      turns: [],
    });

    expect(() => settledTurnsOf(labeled, ["first", "second"])).toThrow(
      "set 4 item 2 save 2: F2",
    );
  });
});
