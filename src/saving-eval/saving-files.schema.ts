import { z } from "zod";

// The turns file, evals/saving/turns.json (#209). It's written once, and read back by
// each later step, so a change to the corpus can't change which turns are in a set.
export const turnsFileSchema = z.object({
  seed: z.string(),
  corpusSessions: z.number(),
  corpusTurns: z.number(),
  turns: z.array(
    z.object({
      set: z.number(),
      sessionId: z.string(),
      spanId: z.string(),
    }),
  ),
});

export type TurnsFile = z.infer<typeof turnsFileSchema>;

// A memory item as a trip version holds it: its row turned into JSON, with its column
// names. A user memory item has no trip.
export const versionMemoryItemSchema = z
  .looseObject({
    id: z.string(),
    trip_id: z.string().nullable(),
    text: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    kind: row.trip_id === null ? ("user" as const) : ("trip" as const),
    text: row.text,
  }));
