import { z } from "zod";

import { savingCheckSchema } from "./saving-answer.schema.js";

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

// Joe's labels for the calibration sets, evals/saving/calibration.json, made from
// calibration.md (#209). Each save is numbered as in the labeler input, so refused
// calls aren't in it, and lists the checks it fails, with Joe's note on it from
// calibration.md ("" when the note is only "fine").
export const calibrationFileSchema = z.object({
  turns: z.array(
    z.object({
      set: z.number(),
      spanId: z.string(),
      saves: z.array(
        z.object({
          n: z.number(),
          tool: z.string(),
          checks: z.array(savingCheckSchema),
          note: z.string(),
        }),
      ),
    }),
  ),
});

export type CalibrationFile = z.infer<typeof calibrationFileSchema>;

export type CalibrationTurn = CalibrationFile["turns"][number];
