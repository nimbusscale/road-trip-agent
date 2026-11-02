-- Up Migration

-- Each trip version keeps its turn's user message: the user's own words, without the
-- app's lines (persistence design, section 8.9). Evaluation tooling finds the turn's
-- message in the transcript by counting, and checks it against this one, so a change to
-- how the count works can't pair a version with the wrong message. Versions saved before
-- this get an empty message, which never matches, so they can't be used.
ALTER TABLE trip_versions ADD COLUMN user_message text NOT NULL DEFAULT '';
ALTER TABLE trip_versions ALTER COLUMN user_message DROP DEFAULT;
