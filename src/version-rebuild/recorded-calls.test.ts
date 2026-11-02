import { describe, expect, it } from "vitest";

import { FORGOTTEN_LINE } from "../agent/app-lines.js";
import {
  toolResult,
  toolUse,
  userMessage,
} from "./fake-recorded-lines.schema.js";
import { recordedCallsIn, recordedTurnsOf } from "./recorded-calls.js";

const READ = "mcp__trip__read_itinerary";
const WRITE = "mcp__trip__add_stops";

describe("recordedTurnsOf", () => {
  it("numbers the turns by the user's messages, without the app's lines, from each message's time", () => {
    const turns = recordedTurnsOf(
      [
        userMessage(
          "2026-10-30T14:00:00.000Z",
          "Today is Friday, October 30, 2026.\n\nPlan Moab.",
        ),
        userMessage("2026-10-30T14:05:00.000Z", "Add Arches."),
      ],
      new Map(),
    );

    expect(
      turns.map(({ turn, userMessage: text, startedAt }) => [
        turn,
        text,
        startedAt.toISOString(),
      ]),
    ).toEqual([
      [1, "Plan Moab.", "2026-10-30T14:00:00.000Z"],
      [2, "Add Arches.", "2026-10-30T14:05:00.000Z"],
    ]);
  });

  it("puts a worker's calls in its turn, ordering a read by when it was made and a write by when it was answered", () => {
    const coordinator = [
      userMessage("2026-10-30T14:00:00.000Z", "Plan Moab."),
      toolUse("2026-10-30T14:00:01.000Z", "agent", "Agent"),
      toolResult("2026-10-30T14:00:09.000Z", "agent", "done"),
      userMessage("2026-10-30T14:05:00.000Z", "Thanks."),
    ];
    const worker = [
      toolUse("2026-10-30T14:00:02.000Z", "write", WRITE),
      toolUse("2026-10-30T14:00:03.000Z", "read", READ),
      toolResult("2026-10-30T14:00:04.000Z", "read", "the itinerary"),
      toolResult("2026-10-30T14:00:05.000Z", "write", "Added 1 stop"),
    ];

    const [first, second] = recordedTurnsOf(
      coordinator,
      new Map([["subagents/agent-a1", worker]]),
    );

    expect(first?.calls.map((call) => [call.toolUseId, call.agent])).toEqual([
      ["read", "subagents/agent-a1"],
      ["write", "subagents/agent-a1"],
      ["agent", ""],
    ]);
    expect(second?.calls).toEqual([]);
  });

  it("stops at a message that says the user forgot memory items in the app", () => {
    expect(() =>
      recordedTurnsOf(
        [
          userMessage(
            "2026-10-30T14:00:00.000Z",
            `${FORGOTTEN_LINE}\n\nThanks.`,
          ),
        ],
        new Map(),
      ),
    ).toThrow("Turn 1's message says the user forgot memory items in the app");
  });
});

describe("recordedCallsIn", () => {
  it("keeps each call's input, reply, and whether it was refused", () => {
    const [call] = recordedCallsIn(
      [
        toolUse("2026-10-30T14:00:01.000Z", "write", WRITE, { dayId: "day_a" }),
        toolResult(
          "2026-10-30T14:00:02.000Z",
          "write",
          "Nothing was changed.",
          true,
        ),
      ],
      "",
    );

    expect(call).toMatchObject({
      name: WRITE,
      input: { dayId: "day_a" },
      replyText: "Nothing was changed.",
      isError: true,
    });
  });

  it("refuses a transcript with a call that has no reply", () => {
    expect(() =>
      recordedCallsIn([toolUse("2026-10-30T14:00:01.000Z", "cut", WRITE)], ""),
    ).toThrow("These calls have no reply in the transcript: cut.");
  });
});
