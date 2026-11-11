import { describe, expect, it } from "vitest";

import { RESUMED_LINE } from "../agent/app-lines.js";
import { COORDINATOR_KEY } from "../persistence/transcript-repository.js";
import { copiedLine, recordedTurnStart } from "./recorded-turn.js";
import type { TranscriptRow } from "./turn-run.schema.js";

const RECORDED_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const RUN_ID = "0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e";
const WORKER_KEY = "subagents/agent-a7359654";

function user(text: string): TranscriptRow["line"] {
  return { type: "user", sessionId: RECORDED_ID, message: { content: text } };
}

function reply(text: string): TranscriptRow["line"] {
  return {
    type: "assistant",
    sessionId: RECORDED_ID,
    message: { content: [{ type: "text", text }] },
  };
}

// Turn 1 starts a worker, and so does turn 2. The SDK's queue markers come just before
// turn 2's message. Ids skip, as they do when other sessions write between lines.
const ROWS: TranscriptRow[] = [
  {
    id: 3,
    workerKey: COORDINATOR_KEY,
    line: user("Today is Friday, October 23, 2026.\n\nPlan Bar Harbor."),
  },
  { id: 5, workerKey: WORKER_KEY, line: user("Fill:\n- stay_d4mzfrcj") },
  { id: 6, workerKey: COORDINATOR_KEY, line: reply("Here are some hotels.") },
  { id: 7, workerKey: COORDINATOR_KEY, line: { type: "queue-operation" } },
  { id: 8, workerKey: COORDINATOR_KEY, line: { type: "queue-operation" } },
  {
    id: 9,
    workerKey: COORDINATOR_KEY,
    line: user(
      `Today is Saturday, October 24, 2026.\n${RESUMED_LINE}\n\nFive days.`,
    ),
  },
  { id: 11, workerKey: WORKER_KEY, line: user("Fill:\n- stop_k7m2x9qa") },
  { id: 12, workerKey: COORDINATOR_KEY, line: reply("Done.") },
];

describe("recordedTurnStart", () => {
  it("cuts every transcript's lines before the turn's message and its queue markers, and gives its app lines as recorded", () => {
    const start = recordedTurnStart(ROWS, 2, "Five days.");
    expect(start.rowsBefore.map((row) => row.id)).toEqual([3, 5, 6]);
    expect(start.appLines).toEqual([
      "Today is Saturday, October 24, 2026.",
      RESUMED_LINE,
    ]);
  });

  it("gives no app lines when the turn's message has none", () => {
    const rows = [
      ...ROWS,
      { id: 13, workerKey: COORDINATOR_KEY, line: user("Six days.") },
    ];
    expect(recordedTurnStart(rows, 3, "Six days.").appLines).toEqual([]);
  });

  it("refuses a message with text before the user's words that isn't the app's lines", () => {
    const rows = [
      ...ROWS,
      {
        id: 13,
        workerKey: COORDINATOR_KEY,
        line: user("Something else\n\nSix days."),
      },
    ];
    expect(() => recordedTurnStart(rows, 3, "Six days.")).toThrow(
      "Turn 3's message has text before the user's words that isn't the app's lines.",
    );
  });

  it("leaves out the prompt snapshots, and gives a line whose parent was one the snapshot's parent", () => {
    const snapshot = (uuid: string, parentUuid: string) => ({
      type: "attachment",
      uuid,
      parentUuid,
      attachment: {
        type: "prompt_snapshot",
        systemPrompt: ["Old instructions"],
      },
    });
    const rows: TranscriptRow[] = [
      {
        id: 1,
        workerKey: COORDINATOR_KEY,
        line: { ...user("Plan it."), uuid: "u1", parentUuid: null },
      },
      { id: 2, workerKey: COORDINATOR_KEY, line: snapshot("s1", "u1") },
      { id: 3, workerKey: COORDINATOR_KEY, line: snapshot("s2", "s1") },
      {
        id: 4,
        workerKey: COORDINATOR_KEY,
        line: { ...reply("Done."), uuid: "a1", parentUuid: "s2" },
      },
      { id: 5, workerKey: COORDINATOR_KEY, line: user("Five days.") },
    ];
    const start = recordedTurnStart(rows, 2, "Five days.");
    expect(
      start.rowsBefore.map((row) => [row.id, row.line.parentUuid]),
    ).toEqual([
      [1, null],
      [4, "u1"],
    ]);
  });
});

describe("copiedLine", () => {
  const ids = { recorded: RECORDED_ID, run: RUN_ID };

  it("moves the line to the run's agent session ID, wherever it is", () => {
    const line = {
      type: "attachment",
      sessionId: RECORDED_ID,
      attachment: { path: `/tmp/projects/app/${RECORDED_ID}.jsonl` },
    };
    expect(copiedLine(line, ids)).toEqual({
      type: "attachment",
      sessionId: RUN_ID,
      attachment: { path: `/tmp/projects/app/${RUN_ID}.jsonl` },
    });
  });

  it("leaves a user message as recorded, with its date line in the old wording", () => {
    const message = "Today is Friday, October 23, 2026.\n\nPlan Bar Harbor.";
    expect(copiedLine(user(message), ids)).toEqual({
      type: "user",
      sessionId: RUN_ID,
      message: { content: message },
    });
  });
});
