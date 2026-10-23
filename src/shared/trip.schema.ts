import { z } from "zod";

// The shapes of the home screen's and the trip page's replies (functional spec 3 and
// 10.1). The front end parses them with these schemas. Dates are ISO text.

// Name is null until the trip's focus is set, and the home screen shows "New trip".
export const tripSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  lastUpdatedDateTime: z.string(),
});

export type TripSummary = z.infer<typeof tripSummarySchema>;

export const tripListResponseSchema = z.object({
  trips: z.array(tripSummarySchema),
});

export type TripListResponse = z.infer<typeof tripListResponseSchema>;

export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdDateTime: z.string(),
});

// chatClosed: the trip has started, so no session can be started or resumed
// (functional spec 2).
export const tripPageResponseSchema = z.object({
  trip: tripSummarySchema,
  chatClosed: z.boolean(),
  sessions: z.array(sessionSummarySchema),
});

export type TripPageResponse = z.infer<typeof tripPageResponseSchema>;
