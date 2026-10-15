-- Up Migration

-- One row per memory item (persistence design, section 8.8). Memory is kept apart from
-- the plan, so changing it isn't a write to the trip and takes no row lock (section 2).
-- user_id is Supabase's ID for the user, like trips.owner_id. trip_id is empty for a
-- user memory item. The maximum length and count are settings, so the code checks them,
-- not the table (technical spec section 10).
CREATE TABLE memory_items (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  trip_id text REFERENCES trips (id),
  text text NOT NULL,
  created_date_time timestamptz NOT NULL
);

-- Every query names the user, and items are read back in the order created.
CREATE INDEX memory_items_user_id_idx ON memory_items (user_id, created_date_time);
