-- Up Migration

-- #148 drops the nights a stay's tier was set for, and the check that compared them
-- with the stay's nights (technical spec section 9). The plan schema is strict, so a
-- saved plan that still holds either would fail to load. This removes the key from
-- each stay, and that check's results from the saved list, keeping the order of both.
UPDATE trips
SET plan = jsonb_set(
  jsonb_set(
    plan,
    '{itinerary,stays}',
    (
      SELECT coalesce(jsonb_agg(stay - 'tierSetForNightCount' ORDER BY position), '[]'::jsonb)
      FROM jsonb_array_elements(plan -> 'itinerary' -> 'stays')
        WITH ORDINALITY AS stays (stay, position)
    )
  ),
  '{itinerary,checkResults}',
  (
    SELECT coalesce(jsonb_agg(result ORDER BY position), '[]'::jsonb)
    FROM jsonb_array_elements(plan -> 'itinerary' -> 'checkResults')
      WITH ORDINALITY AS results (result, position)
    WHERE result ->> 'check' <> 'stayTierSetForDifferentNights'
  )
)
WHERE jsonb_path_exists(plan, '$.itinerary.stays[*].tierSetForNightCount')
  OR jsonb_path_exists(
    plan,
    '$.itinerary.checkResults[*] ? (@.check == "stayTierSetForDifferentNights")'
  );
