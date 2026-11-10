import { describe, expect, it } from "vitest";

import type {
  CorpusSession,
  ToolResult,
} from "../grounded-eval/corpus-turn.js";
import { labelerInputOf, savesIn } from "./labeler-input.js";
import type { TurnBefore } from "./turn-before.js";

function call(fields: Partial<ToolResult> & { tool: string }): ToolResult {
  return { worker: null, refused: false, input: null, text: "", ...fields };
}

const BEFORE: TurnBefore = {
  sessionTitle: "Key West",
  turn: 2,
  turnsInSession: 2,
  briefLines: ["focus: Key West", "mustSeesText: (not set)"],
  itineraryLines: ["Day 1: Miami to Key West"],
  memory: [
    {
      id: "mem_trip1",
      kind: "trip",
      text: "Chose late January for the crowds.",
    },
  ],
};

// Two turns. The first saved to memory, which the second's input doesn't show, since
// <before> already has it. The second's first add was refused, and a read and a worker
// ran between its saves.
const SESSION: CorpusSession = {
  sessionId: "session",
  turns: [
    {
      spanId: "turn-1",
      traceId: "trace-1",
      userMessage: "Plan a trip to Key West.",
      toolResults: [
        call({
          tool: "add_memory_item",
          input: '{"text":"Chose late January"}',
          text: "Added mem_trip1 to trip memory.",
        }),
      ],
      reply: "When would you like to go?",
    },
    {
      spanId: "turn-2",
      traceId: "trace-2",
      userMessage: "Maybe the Hemingway house.",
      toolResults: [
        call({
          tool: "add_memory_item",
          refused: true,
          input: '{"text":"too long"}',
          text: "Nothing was changed.",
        }),
        call({
          tool: "add_memory_item",
          input: '{"text":"Maybe the Hemingway house"}',
          text: "Added mem_trip2 to trip memory.",
        }),
        call({ tool: "read_itinerary", text: "Day 1: Miami to Key West" }),
        call({
          tool: "Agent",
          worker: "stay-researcher",
          text: "Found 3 stays.",
        }),
        call({
          tool: "update_trip_brief",
          input: '{"mustSeesText":"The Hemingway house"}',
          text: "Updated the trip brief.",
        }),
      ],
      reply: "I saved the Hemingway house.",
    },
  ],
};

describe("labelerInputOf", () => {
  const input = labelerInputOf(SESSION, "turn-2", BEFORE);

  it("numbers the saves that went through, and leaves out refused calls", () => {
    expect(input).toContain(
      '<save n="1" tool="add_memory_item">\n<input>\n{"text":"Maybe the Hemingway house"}',
    );
    expect(input).toContain(
      '<save n="2" tool="update_trip_brief">\n<input>\n{"mustSeesText":"The Hemingway house"}',
    );
    expect(input).not.toContain("too long");
  });

  it("shows the turn's other calls, unnumbered", () => {
    expect(input).toContain(
      '<tool_call tool="read_itinerary">\n<result>\nDay 1: Miami to Key West',
    );
    expect(input).toContain(
      '<tool_call tool="Agent" worker="stay-researcher">\n<result>\nFound 3 stays.',
    );
  });

  it("gives earlier turns' words, but not their calls", () => {
    expect(input).toContain(
      '<earlier_turn number="1">\n<user_message>\nPlan a trip to Key West.\n</user_message>\n<coordinator_reply>\nWhen would you like to go?',
    );
    expect(input).not.toContain('Chose late January"}');
  });

  it("gives the trip before the turn, with each memory item's ID", () => {
    expect(input).toContain(
      '<trip_memory>\n<item id="mem_trip1">Chose late January for the crowds.</item>\n</trip_memory>',
    );
    expect(input).toContain("<user_memory>\n(none)\n</user_memory>");
    expect(input).toContain(
      "<itinerary>\nDay 1: Miami to Key West\n</itinerary>",
    );
  });
});

describe("savesIn", () => {
  it("counts only the saves that went through", () => {
    const turn = SESSION.turns.find((t) => t.spanId === "turn-2");

    expect(turn === undefined ? [] : savesIn(turn)).toHaveLength(2);
  });
});
