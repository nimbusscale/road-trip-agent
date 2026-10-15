import { z } from "zod";

// A row of the sessions table (migrations/0005_sessions.sql). pg returns timestamptz as
// a Date.
export const sessionRowSchema = z
  .object({
    id: z.string(),
    trip_id: z.string(),
    created_date_time: z.date(),
    title: z.string(),
    agent_session_id: z.uuid(),
  })
  .transform((row) => ({
    id: row.id,
    tripId: row.trip_id,
    createdDateTime: row.created_date_time,
    title: row.title,
    agentSessionId: row.agent_session_id,
  }));

// A transcript line as the Agent SDK wrote it (persistence design, section 6). Its shape
// is the SDK's own, so only the parts the SDK's SessionStoreEntry type names are checked,
// and the rest passes through. pg parses the json column.
export const transcriptLineSchema = z.looseObject({
  type: z.string(),
  uuid: z.string().exactOptional(),
  timestamp: z.string().exactOptional(),
});

export const transcriptLineRowSchema = z
  .object({ line: transcriptLineSchema })
  .transform((row) => row.line);

// A row from the query for a session's worker keys.
export const workerKeyRowSchema = z
  .object({ worker_key: z.string() })
  .transform((row) => row.worker_key);
