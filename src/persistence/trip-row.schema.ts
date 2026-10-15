import { z } from "zod";

import { planSchema } from "./plan.schema.js";

// A row of the trips table (migration 0002). pg turns the jsonb plan into an object.
export const tripRowSchema = z
  .object({
    id: z.string(),
    owner_id: z.uuid(),
    plan: planSchema,
  })
  .transform((row) => ({ id: row.id, ownerId: row.owner_id, plan: row.plan }));

export type TripRow = z.infer<typeof tripRowSchema>;
