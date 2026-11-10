import { describe, expect, it } from "vitest";

import { dateLine } from "../agent/app-lines.js";
import { versionTurnOf } from "./turn-before.js";

const MESSAGES = [
  { turn: 1, userMessage: "Plan a trip to Key West." },
  { turn: 2, userMessage: "yes" },
  { turn: 3, userMessage: "The Speakeasy Inn sounds great." },
  { turn: 4, userMessage: "yes" },
];

function refOf(spanPosition: number, message: string) {
  return { agentSessionId: "session", spanPosition, message };
}

describe("versionTurnOf", () => {
  it("finds the version with the turn's words, after the app's lines", () => {
    const message = `${dateLine("Wednesday, November 4, 2026")}\n\nThe Speakeasy Inn sounds great.`;

    expect(versionTurnOf(refOf(3, message), MESSAGES)).toBe(3);
  });

  it("finds a later version when Phoenix is missing an earlier turn's trace", () => {
    expect(
      versionTurnOf(refOf(2, "The Speakeasy Inn sounds great."), MESSAGES),
    ).toBe(3);
  });

  it("tells two turns with the same words apart by their place", () => {
    expect(versionTurnOf(refOf(2, "yes"), MESSAGES)).toBe(2);
    expect(versionTurnOf(refOf(3, "yes"), MESSAGES)).toBe(4);
  });

  it("refuses a turn no version has the words of", () => {
    expect(() => versionTurnOf(refOf(1, "Something else."), MESSAGES)).toThrow(
      "has no trip version with its message",
    );
  });
});
