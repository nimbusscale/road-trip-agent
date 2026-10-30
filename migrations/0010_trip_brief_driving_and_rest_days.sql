-- Up Migration

-- #230 drops the trip brief's rest days item, since a wish for a rest day now goes to
-- memory, and gives comfortable driving hours a default, so it's never empty (technical
-- spec 5.2). The plan schema is strict, so a saved plan that still holds restDaysText,
-- or an empty comfortableDrivingInHours, would fail to load. This removes the key, with
-- nothing carried over to memory, and sets an empty comfortableDrivingInHours to 4, the
-- default comfortable driving hours setting's starting value (technical spec section
-- 10).
UPDATE trips
SET plan = jsonb_set(
  plan #- '{tripBrief,restDaysText}',
  '{tripBrief,comfortableDrivingInHours}',
  coalesce(nullif(plan -> 'tripBrief' -> 'comfortableDrivingInHours', 'null'::jsonb), '4'::jsonb)
)
WHERE plan -> 'tripBrief' ? 'restDaysText'
  OR plan -> 'tripBrief' -> 'comfortableDrivingInHours' = 'null'::jsonb;
