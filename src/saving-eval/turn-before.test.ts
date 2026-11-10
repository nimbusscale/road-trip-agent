import { describe, expect, it } from "vitest";

import { dateLine } from "../agent/app-lines.js";
import { versionOrderProblems, versionTurnOf } from "./turn-before.js";

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

describe("versionOrderProblems", () => {
  it("finds none when each turn matches a later version", () => {
    const spans = ["Plan a trip to Key West.", "yes", "yes"];

    expect(versionOrderProblems("session", spans, MESSAGES)).toEqual([]);
  });

  it("finds a turn that matches an earlier version than the turn before it", () => {
    // Phoenix is missing the first two turns' traces, so the last "yes" is span 2, and
    // matches turn 2's "yes" rather than turn 4's.
    const spans = ["The Speakeasy Inn sounds great.", "yes"];

    expect(versionOrderProblems("session", spans, MESSAGES)).toEqual([
      "Span 2 matched version turn 2, but span 1 matched turn 3.",
    ]);
  });

  it("finds a turn no version has the words of", () => {
    const spans = ["Plan a trip to Key West.", "Something else."];

    expect(versionOrderProblems("session", spans, MESSAGES)).toEqual([
      "Span 2 has no trip version with its words.",
    ]);
  });
});
