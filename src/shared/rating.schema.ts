import { z } from "zod";

// A rating of a chat turn or a whole session, with an optional note (functional spec
// 10.1). The app saves it in Phoenix (systems design section 10).
export const ratingRequestSchema = z.object({
  rating: z.enum(["up", "down"], { error: "A rating is up or down." }),
  // An empty note is left out.
  note: z.string().trim(),
});

export type RatingRequest = z.infer<typeof ratingRequestSchema>;

// The reply to GET /api/sessions/<session ID>/rating: the user's rating of the session,
// so the page starts with it, or null when there's none, or Phoenix can't be reached.
export const sessionRatingResponseSchema = z.object({
  rating: ratingRequestSchema.nullable(),
});

export type SessionRatingResponse = z.infer<typeof sessionRatingResponseSchema>;

// A turn's rating names its turn span, by its OpenTelemetry span ID: 16 hex
// characters. It isn't checked against the session (systems design section 4).
export const turnRatingParamsSchema = z.object({
  sessionId: z.string(),
  spanId: z
    .string()
    .regex(/^[0-9a-f]{16}$/, { error: "A span ID is 16 hex characters." }),
});
