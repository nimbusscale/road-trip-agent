import { z } from "zod";

// The reply to GET /api/health. The front end parses it with this schema.
export const healthResponseSchema = z.object({
  database: z.enum(["reachable", "unreachable"]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
