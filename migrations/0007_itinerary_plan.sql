-- Up Migration

-- Phase 16 gives the itinerary in the plan document the rest of its parts: start and
-- end places, start date, stays, rejected places, check results, and a full last day
-- (persistence design, section 2). A plan saved before then holds only the itinerary's
-- id and its last day's id. This fills in the new parts, empty, as a new trip has them.
-- A value already there wins, since the right side of || wins.
UPDATE trips
SET plan = jsonb_set(
  plan,
  '{itinerary}',
  jsonb_build_object(
    'startPlaceId', NULL,
    'endPlaceId', NULL,
    'startDate', NULL,
    'stays', '[]'::jsonb,
    'rejectedPlaces', '[]'::jsonb,
    'checkResults', '[]'::jsonb
  )
  || (plan -> 'itinerary')
  || jsonb_build_object(
    'lastDay',
    jsonb_build_object(
      'ownStartTime', NULL,
      'stops', '[]'::jsonb,
      'waypointIds', '[]'::jsonb,
      'leg', NULL,
      'approvals', '[]'::jsonb
    )
    || (plan -> 'itinerary' -> 'lastDay')
  )
)
WHERE NOT (plan -> 'itinerary' ? 'stays');
