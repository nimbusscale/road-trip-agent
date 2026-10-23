import { randomUUID } from "node:crypto";

import type {
  Options,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

import type { RunTurn } from "./coordinator.js";
import type { TurnEvent } from "./turn-event.js";

// A fake in place of the Agent SDK (DEVELOPMENT.md section 5). Each turn replies with
// the same text parts. Like the SDK with eager flushing, it saves each transcript line
// to the session store as it goes, whether or not anything reads the turn's events.
export class FakeSdk {
  readonly calls: { message: string; options: Options }[] = [];
  replyParts = ["Hello!", "Where would you like to go?"];
  // Why each turn fails, or null for turns that succeed.
  failure: string | null = null;
  // Waited on before each part after the first, so a test can act partway through a
  // turn.
  beforeLaterParts: () => Promise<void> = () => Promise.resolve();

  readonly runTurn: RunTurn = (message, options) =>
    this.#turn(message, options);

  async *#turn(message: string, options: Options): AsyncGenerator<TurnEvent> {
    this.calls.push({ message, options });
    const save = async (line: SessionStoreEntry): Promise<void> => {
      const key = {
        projectKey: "fake",
        sessionId: options.sessionId ?? options.resume ?? "",
      };
      await options.sessionStore?.append(key, [
        { uuid: randomUUID(), ...line },
      ]);
    };
    await save({ type: "user", message: { role: "user", content: message } });
    yield { kind: "started", model: "claude-fake-1", tools: [] };
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
    yield { kind: "ended", failure: this.failure, durationMs: 1000 };
  }
}
