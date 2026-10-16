import { z } from "zod";

// Google's error body, such as for a bad key or a request it refuses.
export const googleErrorBodySchema = z
  .object({ error: z.object({ status: z.string(), message: z.string() }) })
  .transform((body) => `${body.error.status}: ${body.error.message}`);
