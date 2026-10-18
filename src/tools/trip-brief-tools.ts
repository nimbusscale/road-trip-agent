import { z } from "zod";

import { ROUTE_TYPES } from "../domain/route-type.js";
import { RuleError } from "../domain/rule-error.js";
import { TIERS } from "../domain/tier.js";
import type { TripBrief } from "../domain/trip-brief.js";
import type { TripBriefService } from "../domain/trip-brief-service.js";
import { checkResultLines } from "./check-results-reply.js";
import {
  CLOCK_TIME_ERROR,
  CLOCK_TIME_TEXT,
  clockTextOf,
  timeOfDayFromClockText,
} from "./clock-time.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import type { TripSession } from "./trip-session.js";
import { textReply, writeReplyOrReadableError } from "./tool-reply.js";

// The trip brief tools (tool design, section 2.1). Each item goes by its name in the
// domain model (section 3.2), so the rule errors, which name the item, match the input.

const NOT_SET = "not set";

export const READ_TRIP_BRIEF_DESCRIPTION =
  'Reads the trip brief: what the user wants from the whole trip. Returns every item, one per line, by the name update_trip_brief takes. An item with no value yet shows as "not set".';

export const UPDATE_TRIP_BRIEF_DESCRIPTION =
  "Changes one or more items in the trip brief, in one save. Items not given are left alone. Each item given replaces its old value. An item can be changed, but never emptied. If any item is refused, nothing is saved, and the error says which item and why, with the limit when there is one. The reply doesn't repeat the items. It gives the feasibility check results that are new or gone, anywhere in the trip, and the trip-wide ones already known.";

export const UPDATE_TRIP_BRIEF_INPUT = z.strictObject({
  focus: z
    .string()
    .optional()
    .describe(
      'What the trip is about: a region, a route, or a theme, such as "Pacific Coast Highway" or "Texas barbecue".',
    ),
  // A number, not an integer: Zod gives every integer a maximum of 2^53 - 1, which the
  // model would read as part of the schema. The brief refuses a fraction itself.
  tripLengthInDays: z
    .number()
    .positive()
    .optional()
    .describe("How many days the user wants. A whole number, at least 1."),
  interestsText: z
    .string()
    .optional()
    .describe("The user's interests, in their words, with why they matter."),
  mustSeesText: z
    .string()
    .optional()
    .describe(
      "The user's must-sees, in their words, with why they matter. A must-see can be one place, an area, a road, or an activity.",
    ),
  comfortableDrivingInHours: z
    .number()
    .positive()
    .optional()
    .describe(
      "How many hours of driving a day the user is comfortable with, such as 5 or 6.5. More than 0. A default for the trip: a day can go over it when the user agrees.",
    ),
  routePreference: z
    .enum(ROUTE_TYPES)
    .optional()
    .describe("Scenic or fastest. A default for the trip."),
  restDaysText: z
    .string()
    .optional()
    .describe(
      "Rest days, in the user's words, such as \"one day off in Moab\". This records what the user asked for. It doesn't mark any day.",
    ),
  usualStartTime: z
    .string()
    .regex(CLOCK_TIME_TEXT, { error: CLOCK_TIME_ERROR })
    .optional()
    .describe(
      'When the party usually gets going each day, as a clock time, such as "8:00 a.m.". It\'s 8:00 a.m. until changed.',
    ),
  defaultTier: z
    .enum(TIERS)
    .optional()
    .describe(
      "The budget tier for lodging and meals when no budget rule covers them.",
    ),
  budgetRulesText: z
    .string()
    .optional()
    .describe(
      'Budget rules, in the user\'s words, such as "mid-range for stays of 2+ nights".',
    ),
  mealPreferencesText: z
    .string()
    .optional()
    .describe(
      'Meal preferences, in the user\'s words, such as "local cafés over hotel breakfast".',
    ),
});

export type TripBriefItems = z.infer<typeof UPDATE_TRIP_BRIEF_INPUT>;

export function readTripBriefTool(session: TripSession): StrictToolDefinition {
  return {
    ...strictTool(
      "read_trip_brief",
      READ_TRIP_BRIEF_DESCRIPTION,
      z.strictObject({}),
      async () => {
        const trip = await session.reader.read(session.tripId);
        return textReply(briefLines(trip.tripBrief));
      },
    ),
    annotations: { readOnlyHint: true },
  };
}

export function updateTripBriefTool(
  session: TripSession,
): StrictToolDefinition {
  return strictTool(
    "update_trip_brief",
    UPDATE_TRIP_BRIEF_DESCRIPTION,
    UPDATE_TRIP_BRIEF_INPUT,
    (items) =>
      writeReplyOrReadableError(async () => {
        if (Object.values(items).every((value) => value === undefined)) {
          throw new RuleError("Give at least one trip brief item to change.");
        }
        const result = await session.writer.write(
          session.tripId,
          "coordinator",
          ({ trip, services }) => {
            applyItems(items, trip.tripBrief, services.tripBrief);
            return trip.itinerary.id;
          },
        );
        // A brief change touches no stop, day, or stay, so only the trip-wide results
        // that are already known come back, along with every new and gone one.
        const touchedIds = new Set([result.changeResult]);
        return textReply([
          "Saved the trip brief.",
          ...(result.checkComparison === null
            ? []
            : checkResultLines(result.checkComparison, touchedIds)),
        ]);
      }),
  );
}

// In functional spec 5.2's order.
function briefLines(brief: TripBrief): string[] {
  return [
    `focus: ${brief.focus ?? NOT_SET}`,
    `tripLengthInDays: ${shown(brief.tripLengthInDays)}`,
    `interestsText: ${brief.interestsText ?? NOT_SET}`,
    `mustSeesText: ${brief.mustSeesText ?? NOT_SET}`,
    `comfortableDrivingInHours: ${shown(brief.comfortableDrivingInHours)}`,
    `routePreference: ${brief.routePreference ?? NOT_SET}`,
    `restDaysText: ${brief.restDaysText ?? NOT_SET}`,
    `usualStartTime: ${clockTextOf(brief.usualStartTime)}`,
    `defaultTier: ${brief.defaultTier ?? NOT_SET}`,
    `budgetRulesText: ${brief.budgetRulesText ?? NOT_SET}`,
    `mealPreferencesText: ${brief.mealPreferencesText ?? NOT_SET}`,
  ];
}

function shown(value: number | null): string {
  return value === null ? NOT_SET : String(value);
}

// Each item's own rules run as it's set. The two with limits in the settings go
// through the service (domain model 4.2).
function applyItems(
  items: TripBriefItems,
  brief: TripBrief,
  service: TripBriefService,
): void {
  whenGiven(items.focus, (value) => (brief.focus = value));
  whenGiven(items.tripLengthInDays, (value) => {
    service.setTripLength(brief, value);
  });
  whenGiven(items.interestsText, (value) => (brief.interestsText = value));
  whenGiven(items.mustSeesText, (value) => (brief.mustSeesText = value));
  whenGiven(items.comfortableDrivingInHours, (value) => {
    service.setComfortableDriving(brief, value);
  });
  whenGiven(items.routePreference, (value) => (brief.routePreference = value));
  whenGiven(items.restDaysText, (value) => (brief.restDaysText = value));
  whenGiven(items.usualStartTime, (value) => {
    brief.usualStartTime = timeOfDayFromClockText(value);
  });
  whenGiven(items.defaultTier, (value) => (brief.defaultTier = value));
  whenGiven(items.budgetRulesText, (value) => (brief.budgetRulesText = value));
  whenGiven(
    items.mealPreferencesText,
    (value) => (brief.mealPreferencesText = value),
  );
}

function whenGiven<T>(value: T | undefined, set: (value: T) => void): void {
  if (value !== undefined) {
    set(value);
  }
}
