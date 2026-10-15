import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";

import type { Queryable } from "./queryable.js";
import {
  transcriptLineRowSchema,
  workerKeyRowSchema,
} from "./session.schema.js";

// The coordinator's own transcript has no worker key. It's stored as empty text, so
// plain equality and the unique index work for it (migrations/0005_sessions.sql).
export const COORDINATOR_KEY = "";

// One transcript: the coordinator's, or one worker's, in one session.
export interface TranscriptKey {
  agentSessionId: string;
  workerKey: string;
}

// Reads and adds transcript line rows (persistence design, section 8.7). Lines are never
// changed or removed (section 6).
export interface TranscriptLineStore {
  // Adds the lines in the order given. A line whose uuid the transcript already has is
  // skipped, since the SDK sends a line again when a send fails.
  addLines(
    key: TranscriptKey,
    lines: readonly SessionStoreEntry[],
  ): Promise<void>;
  // The transcript's lines, in the order added.
  loadLines(key: TranscriptKey): Promise<SessionStoreEntry[]>;
  // The keys of the session's worker transcripts.
  listWorkerKeys(agentSessionId: string): Promise<string[]>;
}

const VALUES_PER_LINE = 4;

export class TranscriptRepository implements TranscriptLineStore {
  constructor(private readonly connection: Queryable) {}

  async addLines(
    key: TranscriptKey,
    lines: readonly SessionStoreEntry[],
  ): Promise<void> {
    if (lines.length === 0) {
      return;
    }
    // One statement, so identity numbers follow the order of the rows listed.
    const placeholders = [...lines.keys()].map(placeholdersOf);
    const values = lines.flatMap((line) => [
      key.agentSessionId,
      key.workerKey,
      line.uuid ?? null,
      JSON.stringify(line),
    ]);
    await this.connection.query(
      `INSERT INTO transcript_lines (agent_session_id, worker_key, line_uuid, line)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT DO NOTHING`,
      values,
    );
  }

  async loadLines(key: TranscriptKey): Promise<SessionStoreEntry[]> {
    const { rows } = await this.connection.query(
      `SELECT line FROM transcript_lines
       WHERE agent_session_id = $1 AND worker_key = $2
       ORDER BY id`,
      [key.agentSessionId, key.workerKey],
    );
    return rows.map((row) => transcriptLineRowSchema.parse(row));
  }

  async listWorkerKeys(agentSessionId: string): Promise<string[]> {
    const { rows } = await this.connection.query(
      `SELECT DISTINCT worker_key FROM transcript_lines
       WHERE agent_session_id = $1 AND worker_key <> $2
       ORDER BY worker_key`,
      [agentSessionId, COORDINATOR_KEY],
    );
    return rows.map((row) => workerKeyRowSchema.parse(row));
  }
}

// The placeholders for the line at this index, such as ($5, $6, $7, $8::json).
function placeholdersOf(index: number): string {
  const at = (offset: number): string =>
    `$${String(index * VALUES_PER_LINE + offset)}`;
  return `(${at(1)}, ${at(2)}, ${at(3)}, ${at(4)}::json)`;
}
