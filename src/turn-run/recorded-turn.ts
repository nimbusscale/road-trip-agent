import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";

import { appLinesOf } from "../agent/app-lines.js";
import { turnMessageIndex } from "../agent/shown-messages.js";
import { transcriptLineSchema } from "../persistence/session.schema.js";
import { COORDINATOR_KEY } from "../persistence/transcript-repository.js";
import {
  promptSnapshotLineSchema,
  type TranscriptRow,
  userTextLineSchema,
} from "./turn-run.schema.js";

// Where a recorded turn starts in its session's transcript (#245).
export interface RecordedTurnStart {
  // Every line before the turn's user message, the coordinator's and the workers', in
  // the order stored.
  rowsBefore: TranscriptRow[];
  // The lines the app added to the turn's message, as recorded.
  appLines: string[];
}

// Finds turn `turn`'s user message among the coordinator's lines, as its trip version
// counted it, and checks it against the words the version saved (persistence design,
// section 8.9). Workers run only inside a coordinator turn, so every worker line from an
// earlier turn is stored before the turn's message. `rows` is the whole session, in the
// order stored.
export function recordedTurnStart(
  rows: readonly TranscriptRow[],
  turn: number,
  userMessage: string,
): RecordedTurnStart {
  const coordinatorRows = rows.filter(
    (row) => row.workerKey === COORDINATOR_KEY,
  );
  const index = turnMessageIndex(
    coordinatorRows.map((row) => row.line),
    turn,
    userMessage,
  );
  const messageRow = coordinatorRows[index];
  if (messageRow === undefined) {
    throw new Error(`The transcript has no line ${String(index)}.`);
  }
  const text = userTextLineSchema.parse(messageRow.line).message.content;
  const { lines, ownWords } = appLinesOf(text);
  // turnMessageIndex() only checks how the message ends.
  if (ownWords !== userMessage) {
    throw new Error(
      `Turn ${String(turn)}'s message has text before the user's words that isn't the app's lines.`,
    );
  }
  return {
    rowsBefore: withoutPromptSnapshots(
      withoutQueueMarkers(rows.filter((row) => row.id < messageRow.id)),
    ),
    appLines: lines,
  };
}

// Claude Code saves the request it built, the system prompt with the tools, as a
// prompt_snapshot line, and a resumed session sends that again. So a run would get the
// instructions and tools the session was recorded with, not today's code's (#209). The
// snapshots are left out, and a line whose parent was one takes the snapshot's parent,
// so the chain of lines stays whole.
function withoutPromptSnapshots(rows: TranscriptRow[]): TranscriptRow[] {
  const snapshotParents = new Map<string, unknown>();
  for (const row of rows) {
    const snapshot = promptSnapshotLineSchema.safeParse(row.line);
    if (snapshot.success) {
      snapshotParents.set(snapshot.data.uuid, snapshot.data.parentUuid);
    }
  }
  const parentFor = (parent: unknown): unknown => {
    let kept = parent;
    while (typeof kept === "string" && snapshotParents.has(kept)) {
      kept = snapshotParents.get(kept);
    }
    return kept;
  };
  return rows
    .filter((row) => !promptSnapshotLineSchema.safeParse(row.line).success)
    .map((row) => {
      const { parentUuid } = row.line;
      return typeof parentUuid === "string" && snapshotParents.has(parentUuid)
        ? { ...row, line: { ...row.line, parentUuid: parentFor(parentUuid) } }
        : row;
    });
}

// The SDK marks a message's place in its queue with lines just before the message. The
// run's own message gets its own, so the recorded message's are left out. The model
// never sees them.
function withoutQueueMarkers(rows: TranscriptRow[]): TranscriptRow[] {
  let end = rows.length;
  while (end > 0 && rows[end - 1]?.line.type === QUEUE_MARKER_TYPE) {
    end--;
  }
  return rows.slice(0, end);
}

const QUEUE_MARKER_TYPE = "queue-operation";

// A recorded line as the run's transcript holds it. The SDK writes the session's agent
// session ID into its lines, so the run's ID takes its place. A UUID can't be part of
// any other text, so it's replaced wherever it is. The model is never sent it. Nothing
// else changes, not even a date line in the old wording: the API drops each of the
// coordinator's thinking blocks when the conversation before it has changed
// (persistence design, section 8.9).
export function copiedLine(
  line: SessionStoreEntry,
  agentSessionIds: { recorded: string; run: string },
): SessionStoreEntry {
  return transcriptLineSchema.parse(
    JSON.parse(
      JSON.stringify(line).replaceAll(
        agentSessionIds.recorded,
        agentSessionIds.run,
      ),
    ),
  );
}
