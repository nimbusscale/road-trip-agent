import type { z } from "zod";

import { FORGOTTEN_LINE } from "../agent/app-lines.js";
import { shownLineSchema } from "../agent/shown-line.schema.js";
import {
  shownMessagesOf,
  turnMessageIndex,
  userMessageCount,
} from "../agent/shown-messages.js";
import { callKindOf } from "./call-kinds.js";
import {
  blockLineSchema,
  type RecordedResult,
  type RecordedUse,
  timedLineSchema,
  toolResultBlockSchema,
  toolUseBlockSchema,
} from "./recorded-line.schema.js";

// One tool call from a session's transcripts, with the reply it got.
export interface RecordedCall {
  readonly toolUseId: string;
  readonly name: string;
  readonly input: unknown;
  // Empty for the coordinator, or the worker's transcript key.
  readonly agent: string;
  readonly usedAt: Date;
  readonly answeredAt: Date;
  readonly replyText: string;
  readonly isError: boolean;
}

// One coordinator turn: its user message, counted and taken as the app saves a trip
// version (persistence design, section 8.9), and every call made during it, the
// workers' included, in the order they reached the trip.
export interface RecordedTurn {
  readonly turn: number;
  readonly userMessage: string;
  readonly startedAt: Date;
  readonly calls: readonly RecordedCall[];
}

export function recordedTurnsOf(
  coordinatorLines: readonly unknown[],
  workerLines: ReadonlyMap<string, readonly unknown[]>,
): RecordedTurn[] {
  const calls = [
    ...recordedCallsIn(coordinatorLines, ""),
    ...[...workerLines].flatMap(([key, lines]) => recordedCallsIn(lines, key)),
  ].sort((a, b) => orderTimeOf(a).getTime() - orderTimeOf(b).getTime());
  const turns = turnStartsOf(coordinatorLines);
  return turns.map((turn, index) => {
    const next = turns[index + 1]?.startedAt.getTime() ?? Infinity;
    return {
      ...turn,
      calls: calls.filter((call) => {
        const at = orderTimeOf(call).getTime();
        return at >= turn.startedAt.getTime() && at < next;
      }),
    };
  });
}

// A read sees the trip as it was when it was called. A change reaches the trip when
// its write commits, just before its reply. So parallel calls are put in that order.
export function orderTimeOf(call: RecordedCall): Date {
  return callKindOf(call.name) === "checkpoint" ? call.usedAt : call.answeredAt;
}

// The user messages as the browser shows them, the way the app counts turns.
// turnMessageIndex() checks that each one is where the count puts it.
function turnStartsOf(
  lines: readonly unknown[],
): Omit<RecordedTurn, "calls">[] {
  const messages = shownMessagesOf(lines).filter(
    (message) => message.role === "user",
  );
  if (messages.length !== userMessageCount(lines)) {
    throw new Error("The transcript's user messages don't match its count.");
  }
  return messages.map(({ text }, index) => {
    const turn = index + 1;
    const line = lines[turnMessageIndex(lines, turn, text)];
    refuseOutsideChange(turn, line);
    return {
      turn,
      userMessage: text,
      startedAt: timedLineSchema.parse(line).at,
    };
  });
}

// A memory item forgotten in the chat view shows only as the app's line on the next
// message, which doesn't say which one. No session rebuilt so far has one, so the
// rebuild stops rather than guess.
function refuseOutsideChange(turn: number, line: unknown): void {
  const parsed = shownLineSchema.safeParse(line);
  if (parsed.success && parsed.data.text.split("\n").includes(FORGOTTEN_LINE)) {
    throw new Error(
      `Turn ${String(turn)}'s message says the user forgot memory items in the app, which the rebuild doesn't handle.`,
    );
  }
}

// Every call in one transcript. A call with no reply can't be placed in time, or known
// to have saved, so it stops the rebuild.
export function recordedCallsIn(
  lines: readonly unknown[],
  agent: string,
): RecordedCall[] {
  const uses = new Map<string, RecordedUse & { at: Date }>();
  const calls: RecordedCall[] = [];
  for (const line of lines) {
    const parsed = blockLineSchema.safeParse(line);
    if (!parsed.success) {
      continue;
    }
    const { at, blocks } = parsed.data;
    for (const use of blocksOf(blocks, toolUseBlockSchema)) {
      uses.set(use.id, { ...use, at });
    }
    for (const result of blocksOf(blocks, toolResultBlockSchema)) {
      const use = uses.get(result.toolUseId);
      if (use !== undefined) {
        calls.push(callOf(use, result, agent, at));
        uses.delete(result.toolUseId);
      }
    }
  }
  const unanswered = [...uses.keys()];
  if (unanswered.length > 0) {
    throw new Error(
      `These calls have no reply in the transcript: ${unanswered.join(", ")}.`,
    );
  }
  return calls;
}

function blocksOf<T>(blocks: readonly unknown[], schema: z.ZodType<T>): T[] {
  return blocks.flatMap((block) => {
    const parsed = schema.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}

function callOf(
  use: RecordedUse & { at: Date },
  result: RecordedResult,
  agent: string,
  answeredAt: Date,
): RecordedCall {
  return {
    toolUseId: use.id,
    name: use.name,
    input: use.input,
    agent,
    usedAt: use.at,
    answeredAt,
    replyText: result.text,
    isError: result.isError,
  };
}
