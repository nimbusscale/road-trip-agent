-- Up Migration

-- One row per trip (persistence design, section 2). The plan is one JSON document: the
-- trip brief, the itinerary with everything it holds, and last updated. A write loads it
-- whole and saves it whole, so its parts get no columns of their own.
-- owner_id is Supabase's ID for the user. Users live in Supabase, so nothing links it
-- to a table here (systems design, section 3).
CREATE TABLE trips (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL,
  plan jsonb NOT NULL
);

-- The home screen lists a user's trips.
CREATE INDEX trips_owner_id_idx ON trips (owner_id);
