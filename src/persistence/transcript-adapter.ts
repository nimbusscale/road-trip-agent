import type {
  SessionKey,
  SessionStore,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

import type { Queryable } from "./queryable.js";
import {
  COORDINATOR_KEY,
  type TranscriptKey,
  type TranscriptLineStore,
} from "./transcript-repository.js";

export interface TranscriptAdapterOptions {
  pool: Queryable;
  makeStore: (connection: Queryable) => TranscriptLineStore;
}

// The adapter for the Agent SDK's sessionStore option (persistence design, section 6).
// The SDK sends it each transcript line as it's written, and asks for the lines back on
// resume. Hand the SDK sessionStoreFlush: "eager" with it, or lines arrive only at the
// end of each turn.
//
// The SDK's project key is ignored. It's the working folder, which differs between a
// laptop and the server, and agentSessionId is already unique.
export class TranscriptAdapter implements SessionStore {
  // Each append waits for the one before it, so lines are stored in the order the SDK
  // sent them, even when it sends the next batch before the last is stored.
  #lastAppend: Promise<void> = Promise.resolve();

  constructor(private readonly options: TranscriptAdapterOptions) {}

  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    const append = this.#lastAppend.then(() =>
      this.#store().addLines(transcriptKeyOf(key), entries),
    );
    // A failed append doesn't stop the ones after it. The SDK sees the failure, and
    // tries again.
    this.#lastAppend = append.catch(() => undefined);
    return append;
  }

  // Null for a transcript that was never written, as the SDK asks.
  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    const lines = await this.#store().loadLines(transcriptKeyOf(key));
    return lines.length === 0 ? null : lines;
  }

  // The worker transcripts, so a resume restores them too.
  listSubkeys(key: { sessionId: string }): Promise<string[]> {
    return this.#store().listWorkerKeys(key.sessionId);
  }

  #store(): TranscriptLineStore {
    return this.options.makeStore(this.options.pool);
  }
}

function transcriptKeyOf(key: SessionKey): TranscriptKey {
  return {
    agentSessionId: key.sessionId,
    workerKey: key.subpath ?? COORDINATOR_KEY,
  };
}
