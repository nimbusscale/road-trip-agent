import { z } from "zod";

import { ROUTE_TYPES } from "../domain/route-type.js";
import type { TripBriefSettings } from "../domain/trip-brief-service.js";
import { CLOCK_TIME_ERROR, CLOCK_TIME_TEXT } from "./clock-time.js";

// The trip brief tools' inputs (tool design, section 2.1). Each item goes by its name in
// the domain model (section 3.2), so the rule errors, which name the item, match the input.

export const READ_TRIP_BRIEF_INPUT = z.strictObject({});

// "In the user's words" alone pushed the coordinator to copy a whole message into one
// item, such as a "maybe" into the must-sees (#209). The coordinator's instructions say
// how to sort a message into the items.
const USER_WORDS =
  "In the user's words. Leave out the parts of their message that belong in other items.";

// Each input says only how to pass its value: its format, units, and limits. What
// each item means, with examples, is in the coordinator's instructions (tool design,
// section 4). Said in both places, the two drift apart. The
// two limits that are settings are filled in from them, never written into the text,
// so a changed setting can't leave a stale number. They're in the descriptions, not
// the schema: TripBriefService refuses a value over them with an error the agent can
// read, which a schema failure isn't.
export function updateTripBriefInput(limits: TripBriefSettings) {
  return z.strictObject({
    focus: z.string().optional().describe("A short phrase."),
    // A number, not an integer: Zod gives every integer a maximum of 2^53 - 1, which the
    // model would read as part of the schema. The brief refuses a fraction itself.
    tripLengthInDays: z
      .number()
      .positive()
      .optional()
      .describe(
        `A whole number, from 1 to ${String(limits.maximumTripLengthDays)}.`,
      ),
    interestsText: z.string().optional().describe(USER_WORDS),
    mustSeesText: z.string().optional().describe(USER_WORDS),
    comfortableDrivingInHours: z
      .number()
      .positive()
      .optional()
      .describe(
        `Hours, such as 5 or 6.5. At most ${String(limits.maximumDailyDrivingHours)}.`,
      ),
    routePreference: z.enum(ROUTE_TYPES).optional(),
    usualStartTime: z
      .string()
      .regex(CLOCK_TIME_TEXT, { error: CLOCK_TIME_ERROR })
      .optional()
      .describe('A clock time, such as "8:00 a.m.".'),
    mealPreferencesText: z.string().optional().describe(USER_WORDS),
    lodgingPreferencesText: z.string().optional().describe(USER_WORDS),
  });
}

export type TripBriefItems = z.infer<ReturnType<typeof updateTripBriefInput>>;
