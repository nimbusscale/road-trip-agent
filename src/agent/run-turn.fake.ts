import { randomUUID } from "node:crypto";

import type {
  Options,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

import type { RunTurn } from "./coordinator.js";
import type { TurnEvent, TurnUsage } from "./turn-event.js";

export const FAKE_SPAN_ID = "0123456789abcdef";

const FAKE_USAGE: TurnUsage = {
  modelCalls: 2,
  inputTokens: 12000,
  cachedInputTokens: 9000,
  outputTokens: 300,
};

// A fake in place of the Agent SDK (DEVELOPMENT.md section 5). Each turn replies with
// the same events before the reply, and the same text parts. Like the SDK with eager flushing, it saves each transcript line
// to the session store as it goes, whether or not anything reads the turn's events.
export class FakeSdk {
  readonly calls: { message: string; options: Options; userId: string }[] = [];
  // Such as thinking, and a tool call and its reply. Only the text parts are saved.
  beforeReply: TurnEvent[] = [];
  replyParts = ["Hello!", "Where would you like to go?"];
  // Why each turn fails, or null for turns that succeed.
  failure: string | null = null;
  // Waited on before each part after the first, so a test can act partway through a
  // turn.
  beforeLaterParts: () => Promise<void> = () => Promise.resolve();

  readonly runTurn: RunTurn = (message, options, userId) =>
    this.#turn(message, options, userId);

  async *#turn(
    message: string,
    options: Options,
    userId: string,
  ): AsyncGenerator<TurnEvent> {
    this.calls.push({ message, options, userId });
    const save = async (line: SessionStoreEntry): Promise<void> => {
      const key = {
        projectKey: "fake",
        sessionId: options.sessionId ?? options.resume ?? "",
      };
      await options.sessionStore?.append(key, [
        { uuid: randomUUID(), ...line },
      ]);
    };
    yield { kind: "traced", spanId: FAKE_SPAN_ID };
    await save({ type: "user", message: { role: "user", content: message } });
    yield { kind: "started", model: "claude-fake-1", tools: [] };
    yield* this.beforeReply;
    for (const [index, text] of this.replyParts.entries()) {
      if (index > 0) {
        await this.beforeLaterParts();
      }
      await save({
        type: "assistant",
        message: { content: [{ type: "text", text }] },
      });
      yield { kind: "text", text };
    }
    yield {
      kind: "ended",
      failure: this.failure,
      durationMs: 1000,
      usage: FAKE_USAGE,
    };
  }
}
