-- Up Migration

-- One row per session: one conversation with the agent about a trip (persistence design,
-- section 8.5). Nothing about a session changes once it's created.
-- agent_session_id is the Agent SDK's ID for the conversation, a UUID the app chooses.
CREATE TABLE sessions (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips (id),
  created_date_time timestamptz NOT NULL,
  title text NOT NULL,
  agent_session_id uuid NOT NULL UNIQUE
);

-- The trip's session list, in the order created.
CREATE INDEX sessions_trip_id_idx ON sessions (trip_id, created_date_time);

-- One row per transcript line, as the Agent SDK wrote it (persistence design, section 6).
-- Lines are never changed or removed. id keeps the order the SDK sent them in.
-- worker_key is the SDK's key for a worker's transcript, such as
-- 'subagents/agent-a1b2c3', and empty for the coordinator's. Empty rather than null, so
-- the unique index below and plain equality both work for it.
-- line_uuid is the line's own uuid. Most lines have one, but not all.
-- line is json, not jsonb: nothing queries inside it, and jsonb refuses some text a line
-- can hold, such as an escaped NUL character.
CREATE TABLE transcript_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_session_id uuid NOT NULL REFERENCES sessions (agent_session_id),
  worker_key text NOT NULL,
  line_uuid text,
  line json NOT NULL
);

-- The SDK sends a line again when a send fails, so a line with a uuid is stored once.
-- A line with no uuid is always stored.
CREATE UNIQUE INDEX transcript_lines_line_uuid_idx
  ON transcript_lines (agent_session_id, worker_key, line_uuid)
  WHERE line_uuid IS NOT NULL;

-- A resume reads each transcript back in order.
CREATE INDEX transcript_lines_transcript_idx
  ON transcript_lines (agent_session_id, worker_key, id);
