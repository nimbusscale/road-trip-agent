import { z } from "zod";

// The reply to a refused or failed request. The message is written for the user. The
// front end parses it with this schema.
export const errorResponseSchema = z.object({ error: z.string() });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
