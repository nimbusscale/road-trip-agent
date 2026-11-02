-- Up Migration

-- A place is keyed by its trip and its ID, and a memory item by its user and its ID
-- (persistence design, section 8.7). Each ID was unique in the whole table. A run that
-- starts from a recorded turn (#245) copies a trip version into a new trip, for a new
-- test user, and keeps the recorded IDs, since the copied conversation names them. So
-- the same ID can now be in several trips, or for several users. Every query already
-- names the trip or the user.
ALTER TABLE places DROP CONSTRAINT places_pkey;
ALTER TABLE places ADD PRIMARY KEY (trip_id, id);

ALTER TABLE memory_items DROP CONSTRAINT memory_items_pkey;
ALTER TABLE memory_items ADD PRIMARY KEY (user_id, id);
