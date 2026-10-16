import { z } from "zod";

import { ROUTE_TYPES } from "../domain/route-type.js";
import { TIERS } from "../domain/tier.js";
import { itinerarySchema } from "./itinerary-plan.schema.js";
import { timeOfDaySchema } from "./plan-values.schema.js";

// The plan document in a trip's row (persistence design, section 2). A link to another
// object is stored as its ID. Values are checked here only for their type. The objects
// run their own rules when plan-document.ts builds them.

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

export const planSchema = z.strictObject({
  tripBrief: tripBriefSchema,
  itinerary: itinerarySchema,
  lastUpdatedDateTime: z.iso.datetime(),
});

// The document as it's stored, with each time of day as text.
export type PlanDocumentText = z.input<typeof planSchema>;
