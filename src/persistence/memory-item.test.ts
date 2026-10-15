import { describe, expect, it } from "vitest";

import { RuleError } from "../domain/rule-error.js";
import { MemoryItem } from "./memory-item.js";

const PROPERTIES = {
  id: "mem_k7m2x9qa",
  userId: "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f",
  tripId: null,
  text: "we skip chains",
  createdDateTime: new Date("2026-10-15T12:00:00Z"),
};

describe("MemoryItem", () => {
  it("refuses empty text when made", () => {
    expect(() => new MemoryItem({ ...PROPERTIES, text: " " })).toThrow(
      new RuleError("A memory item's text can't be empty."),
    );
  });

  it("refuses empty text when changed, and keeps the old text", () => {
    const item = new MemoryItem(PROPERTIES);
    expect(() => {
      item.text = "";
    }).toThrow(RuleError);
    expect(item.text).toBe("we skip chains");
  });
});
