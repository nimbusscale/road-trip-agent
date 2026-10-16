-- Up Migration

-- One row per place, per trip (persistence design, section 2). A place is stored apart
-- from the plan, and the plan links to it by id. Its facts are a snapshot of a Google
-- lookup and never change. Only name can be filled in, once, when Google has none
-- (domain model 3.10).
-- opening_periods is a list of {openDay, openTime, closeDay, closeTime}, with each time
-- as "HH:MM" text. Nothing queries inside it.
CREATE TABLE places (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips (id),
  google_place_id text NOT NULL,
  name text,
  type text,
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  rating double precision,
  review_count integer,
  price_level text,
  opening_periods jsonb NOT NULL,
  weekday_hours_lines text[] NOT NULL,
  summaries text[] NOT NULL,
  links text[] NOT NULL
);

-- One record per trip for each Google place (domain model 3.10). A search that finds a
-- place the trip already has keeps the stored row. The index also serves loading a
-- trip's places.
CREATE UNIQUE INDEX places_trip_id_google_place_id_idx
  ON places (trip_id, google_place_id);
