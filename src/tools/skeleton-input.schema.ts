import { z } from "zod";

import type { Settings } from "../config/settings.schema.js";
import { ROUTE_TYPES } from "../domain/route-type.js";
import { TIERS } from "../domain/tier.js";
import { CLOCK_TIME_ERROR, CLOCK_TIME_TEXT } from "./clock-time.js";
import { FIRST } from "./trip-items.js";

// The inputs of the tools that build the skeleton (tool design 2.1). Each input says
// only how to pass its value. What each item means is in the coordinator's instructions
// (tool design, section 4).

// A day's start time takes this in place of a time, to go back to the trip brief's usual
// start time, since in the update tools a blank means "don't change it". Not "none",
// which reads as no start time (tool design 2.1, "Times are clock times").
export const DEFAULT_START_TIME = "default";

// The approvals a day holds. Only a stop holds an opening hours approval.
export const DAY_APPROVAL_KINDS = ["driveHours", "routeType"] as const;

const placeId = z.string().describe("A place ID, such as place_k7m2x9qa.");

const stayId = z.string().describe("A stay ID, such as stay_k7m2x9qa.");

const dayId = z.string().describe("A day ID, such as day_k7m2x9qa.");

const namedPlace = z.strictObject({
  placeId,
  name: z
    .string()
    .describe(
      'What to call the place, such as "Mike\'s house". Used only when Google has no name for it.',
    ),
});

const after = z
  .string()
  .describe(`The ID of the stay it goes after, or "${FIRST}".`);

// A number, not an integer: Zod gives every integer a maximum of 2^53 - 1, which the
// model would read as part of the schema. The stay refuses a fraction itself.
const nightCount = z
  .number()
  .positive()
  .describe("A whole number of nights, at least 1.");

// What the rule means is in the coordinator's instructions (tool design, section 4).
const tierRule = z
  .string()
  .describe('In a few words, such as "the default tier".');

const reason = z.string().describe("The user's reason, in a few words.");

export const UPDATE_ITINERARY_INPUT = z.strictObject({
  startPlace: namedPlace.optional(),
  endPlace: namedPlace.optional(),
  startDate: z.string().optional().describe('A date, such as "2027-10-10".'),
});

export const ADD_STAY_INPUT = z.strictObject({
  placeId,
  after,
  nightCount,
  tier: z.enum(TIERS),
  tierRule,
});

export const UPDATE_STAY_INPUT = z.strictObject({
  stayId,
  placeId: placeId.optional(),
  after: after.optional(),
  nightCount: nightCount.optional(),
  tier: z.strictObject({ tier: z.enum(TIERS), tierRule }).optional(),
});

export const REMOVE_STAY_INPUT = z.strictObject({ stayId });

// The maximum daily driving is a setting, filled in here, never written into the text
// (tool design, section 4). It's in the description, not the schema: DaysService
// refuses more with an error the agent can read.
export function updateDayInput(
  limits: Pick<Settings, "maximumDailyDrivingHours">,
) {
  return z.strictObject({
    dayId,
    isRestDay: z.boolean().optional(),
    startTime: z
      .string()
      .refine(
        (text) => text === DEFAULT_START_TIME || CLOCK_TIME_TEXT.test(text),
        { error: `${CLOCK_TIME_ERROR}, or "${DEFAULT_START_TIME}".` },
      )
      .optional()
      .describe(
        `A clock time, such as "5:30 a.m.", or "${DEFAULT_START_TIME}" to use the trip brief's usual start time.`,
      ),
    approveDriveHours: z
      .strictObject({
        hours: z
          .number()
          .positive()
          .describe(
            `Hours of driving, such as 7 or 7.5. At most ${String(limits.maximumDailyDrivingHours)}.`,
          ),
        reason,
      })
      .optional(),
    approveRouteType: z
      .strictObject({ routeType: z.enum(ROUTE_TYPES), reason })
      .optional(),
    removeApproval: z.enum(DAY_APPROVAL_KINDS).optional(),
  });
}

// What the reason is for is in the coordinator's instructions (tool design, section 4).
export const SET_WAYPOINTS_INPUT = z.strictObject({
  dayId,
  waypoints: z
    .array(
      z.strictObject({
        placeId,
        reason: z
          .string()
          .describe('In a few words, such as "steer onto US-1".'),
      }),
    )
    .describe("An empty list clears them."),
});

export type UpdateDayInput = z.infer<ReturnType<typeof updateDayInput>>;
export type UpdateStayInput = z.infer<typeof UPDATE_STAY_INPUT>;
export type UpdateItineraryInput = z.infer<typeof UPDATE_ITINERARY_INPUT>;
