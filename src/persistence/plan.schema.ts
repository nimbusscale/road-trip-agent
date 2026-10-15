import { z } from "zod";

import { ROUTE_TYPES } from "../domain/route-type.js";
import { TIERS } from "../domain/tier.js";
import { TIME_OF_DAY_TEXT, TimeOfDay } from "../domain/time-of-day.js";

// The plan document in a trip's row (persistence design, section 2). Phase 16 and later
// add the rest of the itinerary as they add its objects. A link to another object is
// stored as its ID. Values are checked here only for their type. The objects run their
// own rules when plan-document.ts builds them.

// A time of day is stored as "HH:MM" text, and parsed back into a TimeOfDay.
const timeOfDaySchema = z
  .string()
  .regex(TIME_OF_DAY_TEXT)
  .transform((text) => TimeOfDay.fromText(text));

const tripBriefSchema = z.strictObject({
  id: z.string(),
  focus: z.string().nullable(),
  tripLengthInDays: z.number().nullable(),
  interestsText: z.string().nullable(),
  mustSeesText: z.string().nullable(),
  comfortableDrivingInHours: z.number().nullable(),
  routePreference: z.enum(ROUTE_TYPES).nullable(),
  restDaysText: z.string().nullable(),
  usualStartTime: timeOfDaySchema,
  defaultTier: z.enum(TIERS).nullable(),
  budgetRulesText: z.string().nullable(),
  mealPreferencesText: z.string().nullable(),
});

const itinerarySchema = z.strictObject({
  id: z.string(),
  lastDay: z.strictObject({ id: z.string() }),
});

export const planSchema = z.strictObject({
  tripBrief: tripBriefSchema,
  itinerary: itinerarySchema,
  lastUpdatedDateTime: z.iso.datetime(),
});

// The document as it's stored, with each time of day as text.
export type PlanDocumentText = z.input<typeof planSchema>;
