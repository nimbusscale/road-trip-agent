import { describe, expect, it } from "vitest";

import { answerFitsSaves } from "./saving-answer.schema.js";

function answerOf(numbers: number[]) {
  return { saves: numbers.map((n) => ({ n, failures: [] })) };
}

describe("answerFitsSaves", () => {
  it("accepts one entry for each save, in order", () => {
    expect(answerFitsSaves(answerOf([1, 2, 3]), 3)).toBe(true);
  });

  it("refuses an answer that skips a save, or numbers them out of order", () => {
    expect(answerFitsSaves(answerOf([1, 3]), 3)).toBe(false);
    expect(answerFitsSaves(answerOf([2, 1]), 2)).toBe(false);
  });
});
