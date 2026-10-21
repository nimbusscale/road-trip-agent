import { z } from "zod";

import { ROUTE_TYPES } from "../domain/route-type.js";
import { TIERS } from "../domain/tier.js";
import { CLOCK_TIME_ERROR, CLOCK_TIME_TEXT } from "./clock-time.js";

// The trip brief tools' inputs (tool design, section 2.1). Each item goes by its name in
// the domain model (section 3.2), so the rule errors, which name the item, match the input.

export const READ_TRIP_BRIEF_INPUT = z.strictObject({});

// Each input says only how to pass its value: its format, units, and limits. What
// each item means is in the coordinator's instructions (tool design, section 4).
export const UPDATE_TRIP_BRIEF_INPUT = z.strictObject({
  focus: z
    .string()
    .optional()
    .describe(
      'A short phrase, such as "Pacific Coast Highway" or "Texas barbecue".',
    ),
  // A number, not an integer: Zod gives every integer a maximum of 2^53 - 1, which the
  // model would read as part of the schema. The brief refuses a fraction itself.
  tripLengthInDays: z
    .number()
    .positive()
    .optional()
    .describe("A whole number, at least 1."),
  interestsText: z.string().optional().describe("In the user's words."),
  mustSeesText: z.string().optional().describe("In the user's words."),
  comfortableDrivingInHours: z
    .number()
    .positive()
    .optional()
    .describe("Hours, such as 5 or 6.5. More than 0."),
  routePreference: z.enum(ROUTE_TYPES).optional(),
  restDaysText: z
    .string()
    .optional()
    .describe('In the user\'s words, such as "one day off in Moab".'),
  usualStartTime: z
    .string()
    .regex(CLOCK_TIME_TEXT, { error: CLOCK_TIME_ERROR })
    .optional()
    .describe('A clock time, such as "8:00 a.m.".'),
  defaultTier: z.enum(TIERS).optional(),
  budgetRulesText: z
    .string()
    .optional()
    .describe(
      'In the user\'s words, such as "mid-range for stays of 2+ nights".',
    ),
  mealPreferencesText: z
    .string()
    .optional()
    .describe(
      'In the user\'s words, such as "local cafés over hotel breakfast".',
    ),
});

export type TripBriefItems = z.infer<typeof UPDATE_TRIP_BRIEF_INPUT>;
