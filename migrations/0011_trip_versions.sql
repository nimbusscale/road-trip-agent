-- Up Migration

-- One row per coordinator turn: a copy of everything the coordinator reads about the
-- trip, as it stood when the turn started (persistence design, section 8.9). Only
-- evaluation tooling reads it. The app never does.
-- turn counts the session's user messages, from 1, the way the browser shows them.
-- plan is the trip row's plan document. places and memory_items are lists of the rows
-- as they were, each row turned into a JSON object with its column names: the trip's
-- places, and the user's memory with the trip's memory. Nothing queries inside them.
CREATE TABLE trip_versions (
  session_id text NOT NULL REFERENCES sessions (id),
  turn integer NOT NULL,
  saved_date_time timestamptz NOT NULL,
  plan jsonb NOT NULL,
  places jsonb NOT NULL,
  memory_items jsonb NOT NULL,
  PRIMARY KEY (session_id, turn)
);
