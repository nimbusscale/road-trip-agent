-- Up Migration

-- #166 gives each of a day's waypoints a reason, such as "steer onto US-1" (domain model
-- 3.6). A day stored its waypoints as waypointIds, a list of place IDs. Now it stores
-- waypoints, a list of a place ID and a reason each. The plan schema is strict, so a
-- saved plan that still holds waypointIds would fail to load. This turns each day's
-- waypointIds into waypoints, in the same order, with a reason that says none was
-- recorded. It runs on every stay's days and on the last day.
CREATE FUNCTION waypoints_with_reasons(day jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (day - 'waypointIds') || jsonb_build_object(
    'waypoints',
    (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('placeId', place_id, 'reason', 'no reason was recorded')
          ORDER BY position
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements_text(coalesce(day -> 'waypointIds', '[]'::jsonb))
        WITH ORDINALITY AS ids (place_id, position)
    )
  )
$$;

UPDATE trips
SET plan = jsonb_set(
  jsonb_set(
    plan,
    '{itinerary,stays}',
    (
      SELECT coalesce(
        jsonb_agg(
          jsonb_set(
            stay,
            '{days}',
            (
              SELECT coalesce(
                jsonb_agg(waypoints_with_reasons(day) ORDER BY day_position),
                '[]'::jsonb
              )
              FROM jsonb_array_elements(stay -> 'days')
                WITH ORDINALITY AS days (day, day_position)
            )
          )
          ORDER BY stay_position
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(plan -> 'itinerary' -> 'stays')
        WITH ORDINALITY AS stays (stay, stay_position)
    )
  ),
  '{itinerary,lastDay}',
  waypoints_with_reasons(plan -> 'itinerary' -> 'lastDay')
)
WHERE plan -> 'itinerary' -> 'lastDay' ? 'waypointIds'
  OR jsonb_path_exists(plan, '$.itinerary.stays[*].days[*].waypointIds');

DROP FUNCTION waypoints_with_reasons(jsonb);
