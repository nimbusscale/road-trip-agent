import { z } from "zod";

import { CHECK_KINDS } from "../domain/check-kind.js";
import { CheckResult } from "../domain/check-result.js";
import { TIERS } from "../domain/tier.js";
import { WEATHER_LABELS } from "../domain/weather-label.js";
import { calendarDateSchema } from "./plan-values.schema.js";
import { candidateSchema, daySchema } from "./stop-plan.schema.js";

// The itinerary's part of the plan document: its stays with their days, the last day,
// the rejected places, and the check results (persistence design, section 2). Its
// parsed form is the domain's StoredItinerary.

const weatherTextSchema = z.strictObject({
  guidance: z.string(),
  label: z.enum(WEATHER_LABELS),
  writtenOnDate: calendarDateSchema,
  writtenForPlaceId: z.string(),
  writtenForDates: z.array(calendarDateSchema).readonly(),
  writtenForActivities: z
    .array(
      z.strictObject({
        stopId: z.string(),
        selectedPlaceId: z.string().nullable(),
      }),
    )
    .readonly(),
});

const stayDaySchema = daySchema.extend({ isRestDay: z.boolean() });

const staySchema = z.strictObject({
  id: z.string(),
  placeId: z.string(),
  lodgingId: z.string().nullable(),
  lodgingCandidates: z.array(candidateSchema).readonly(),
  tier: z.enum(TIERS),
  tierRule: z.string(),
  days: z.array(stayDaySchema).readonly(),
  weatherText: weatherTextSchema.nullable(),
});

const checkResultSchema = z
  .strictObject({
    check: z.enum(CHECK_KINDS),
    subjectId: z.string(),
    text: z.string(),
    isApproved: z.boolean(),
    hasUnselectedStopBefore: z.boolean(),
  })
  .transform((fields) => new CheckResult(fields));

export const itinerarySchema = z.strictObject({
  id: z.string(),
  startPlaceId: z.string().nullable(),
  endPlaceId: z.string().nullable(),
  startDate: calendarDateSchema.nullable(),
  stays: z.array(staySchema).readonly(),
  lastDay: daySchema,
  rejectedPlaces: z
    .array(z.strictObject({ placeId: z.string(), reason: z.string() }))
    .readonly(),
  checkResults: z.array(checkResultSchema).readonly(),
});

// The itinerary as it's stored, with each value as text.
export type ItineraryDocument = z.input<typeof itinerarySchema>;
