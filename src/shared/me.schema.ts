import { z } from "zod";

// The reply to GET /api/me. The front end parses it with this schema.
export const meResponseSchema = z.object({
  userId: z.uuid(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
