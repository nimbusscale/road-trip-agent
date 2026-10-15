import { describe, expect, it } from "vitest";

import { ID_PREFIXES, newId, type IdKind } from "./new-id.js";

const KINDS: readonly IdKind[] = [
  "trip",
  "tripBrief",
  "itinerary",
  "session",
  "stay",
  "day",
  "stop",
  "place",
  "memoryItem",
];

describe("newId", () => {
  it.each(KINDS)("starts a %s ID with its prefix", (kind) => {
    expect(newId(kind).startsWith(ID_PREFIXES[kind])).toBe(true);
  });

  it("puts 8 characters after the prefix", () => {
    expect(newId("stop")).toMatch(/^stop_.{8}$/);
  });

  it("leaves out characters that are easy to confuse", () => {
    const randomParts = Array.from({ length: 500 }, () =>
      newId("stop").slice("stop_".length),
    ).join("");
    expect(randomParts).toMatch(/^[a-z2-9]+$/);
    expect(randomParts).not.toMatch(/[01ilo]/);
  });

  it("makes a different ID each time", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("stop")));
    expect(ids.size).toBe(1000);
  });
});
