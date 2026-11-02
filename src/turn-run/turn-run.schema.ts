import { z } from "zod";

import { transcriptLineSchema } from "../persistence/session.schema.js";

// What a run from a recorded turn reads from the live database (#245).

// A trip version row (migrations/0011_trip_versions.sql). The places and memory items
// are rows turned into JSON with their column names, so they go back into the tables as
// they are. Only the columns the copy changes are checked.
export const versionRowSchema = z
  .object({
    user_message: z.string(),
    saved_date_time: z.date(),
    plan: z.looseObject({}),
    places: z.array(z.looseObject({ trip_id: z.string() })),
    memory_items: z.array(
      z.looseObject({ user_id: z.string(), trip_id: z.string().nullable() }),
    ),
  })
  .transform((row) => ({
    userMessage: row.user_message,
    savedDateTime: row.saved_date_time,
    plan: row.plan,
    places: row.places,
    memoryItems: row.memory_items,
  }));

export type VersionRow = z.infer<typeof versionRowSchema>;

// A transcript line row, with its place in the order of the whole session. pg returns a
// bigint as text.
export const transcriptRowSchema = z
  .object({
    id: z.coerce.number().int(),
    worker_key: z.string(),
    line: transcriptLineSchema,
  })
  .transform((row) => ({
    id: row.id,
    workerKey: row.worker_key,
    line: row.line,
  }));

export type TranscriptRow = z.infer<typeof transcriptRowSchema>;

// A recorded user line whose content is text: a message from the user, or a worker
// brief. A tool's reply is a user line too, but its content is a list.
export const userTextLineSchema = z.looseObject({
  type: z.literal("user"),
  message: z.looseObject({ content: z.string() }),
});
