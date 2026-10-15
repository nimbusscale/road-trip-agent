import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";

import type {
  TranscriptKey,
  TranscriptLineStore,
} from "./transcript-repository.js";

interface LineRow {
  agentSessionId: string;
  workerKey: string;
  line: SessionStoreEntry;
}

// Keeps transcript line rows in memory, in place of Postgres (DEVELOPMENT.md section 5).
// Skipping a line whose uuid is already stored is the database's unique index, so it's
// checked by hand, not here.
export class FakeTranscriptLineStore implements TranscriptLineStore {
  readonly rows: LineRow[] = [];
  // Runs before each addLines stores its lines. Tests use it to slow a call down, or
  // fail one.
  beforeAdd: (lines: readonly SessionStoreEntry[]) => Promise<void> = () =>
    Promise.resolve();

  async addLines(
    key: TranscriptKey,
    lines: readonly SessionStoreEntry[],
  ): Promise<void> {
    await this.beforeAdd(lines);
    for (const line of lines) {
      this.rows.push({ ...key, line });
    }
  }

  loadLines(key: TranscriptKey): Promise<SessionStoreEntry[]> {
    const lines = this.rows
      .filter(
        (row) =>
          row.agentSessionId === key.agentSessionId &&
          row.workerKey === key.workerKey,
      )
      .map((row) => row.line);
    return Promise.resolve(lines);
  }

  listWorkerKeys(agentSessionId: string): Promise<string[]> {
    const keys = this.rows
      .filter((row) => row.agentSessionId === agentSessionId)
      .map((row) => row.workerKey)
      .filter((key) => key !== "");
    return Promise.resolve([...new Set(keys)]);
  }
}
