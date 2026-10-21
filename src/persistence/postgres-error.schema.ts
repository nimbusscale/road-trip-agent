import { z } from "zod";

// Postgres's error code for a lock wait that ran out of time.
const LOCK_NOT_AVAILABLE = "55P03";

// pg throws an error with Postgres's code on it.
export const lockNotAvailableSchema = z.object({
  code: z.literal(LOCK_NOT_AVAILABLE),
});
