import { randomUUID } from "node:crypto";

import { CoordinatorTurns } from "../agent/coordinator-turns.js";
import { type CoordinatorGiven, runTurnWithSdk } from "../agent/coordinator.js";
import type { TurnEvent, TurnUsage } from "../agent/turn-event.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import { sessionAccessFor } from "../persistence/session-access.js";

// Spike (#132): one scripted conversation with the coordinator, for a new trip, through
// the same code as npm run chat (src/chat.ts): CoordinatorTurns, runTurnWithSdk, and the
// trip and session writers.

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface TurnRecord {
  user: string;
  reply: string;
  toolCalls: ToolCall[];
  failure: string | null;
  durationMs: number;
  usage: TurnUsage | null;
}

export interface ConversationRecord {
  userId: string;
  tripId: string;
  sessionId: string;
  turns: TurnRecord[];
}

export interface ScriptedConversationGiven {
  coordinator: CoordinatorGiven;
  pool: Connectable & Queryable;
  // Memory the user has before the trip, added through the memory writer.
  userMemory: readonly string[];
  messages: readonly string[];
}

// A fresh user each run, so memory starts with only what's added here.
export async function runScriptedConversation(
  given: ScriptedConversationGiven,
): Promise<ConversationRecord> {
  const { coordinator, pool, userMemory, messages } = given;
  const userId = randomUUID();
  for (const text of userMemory) {
    await coordinator.memory.writer.add(userId, null, text);
  }
  const [firstText] = messages;
  if (firstText === undefined) {
    throw new Error("A scripted conversation needs at least one message.");
  }
  const trip = await coordinator.trip.writer.startTrip({ id: userId });
  const session = await sessionAccessFor(pool).writer.start(trip.id, firstText);
  const conversation = { session, userId };
  const turns = new CoordinatorTurns({
    coordinator,
    runTurn: runTurnWithSdk,
    now: () => new Date(),
  });
  const records: TurnRecord[] = [];
  for (const text of messages) {
    const turn = await turns.begin(conversation, text);
    records.push(recordOf(text, await collect(turn.events())));
  }
  return { userId, tripId: trip.id, sessionId: session.id, turns: records };
}

async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const collected: TurnEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function recordOf(user: string, events: readonly TurnEvent[]): TurnRecord {
  const record: TurnRecord = {
    user,
    reply: "",
    toolCalls: [],
    failure: null,
    durationMs: 0,
    usage: null,
  };
  const replies: string[] = [];
  for (const event of events) {
    if (event.kind === "text") {
      replies.push(event.text);
    } else if (event.kind === "toolCall") {
      record.toolCalls.push({ name: event.name, input: event.input });
    } else if (event.kind === "ended") {
      record.failure = event.failure;
      record.durationMs = event.durationMs;
      record.usage = event.usage;
    }
  }
  record.reply = replies.join("\n\n");
  return record;
}
