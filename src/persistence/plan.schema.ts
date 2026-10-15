import { z } from "zod";

import { ROUTE_TYPES } from "../domain/route-type.js";
import { TIERS } from "../domain/tier.js";

// The plan document in a trip's row (persistence design, section 2). Phase 16 and later
// add the rest of the itinerary as they add its objects. A link to another object is
// stored as its ID. Values are checked here only for their type. The objects run their
// own rules when plan-document.ts builds them.

const tripBriefSchema = z.strictObject({
  id: z.string(),
  focus: z.string().nullable(),
  tripLengthInDays: z.number().nullable(),
  interestsText: z.string().nullable(),
  mustSeesText: z.string().nullable(),
  comfortableDrivingInHours: z.number().nullable(),
  routePreference: z.enum(ROUTE_TYPES).nullable(),
  restDaysText: z.string().nullable(),
  // A time of day as "HH:MM" text.
  usualStartTime: z.string(),
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

export type PlanDocument = z.infer<typeof planSchema>;
