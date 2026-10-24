import { RuleError } from "../domain/rule-error.js";
import type { TripBrief } from "../domain/trip-brief.js";
import type { TripBriefService } from "../domain/trip-brief-service.js";
import { checkResultLines } from "./check-results-reply.js";
import { clockTextOf, timeOfDayFromClockText } from "./clock-time.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import {
  READ_TRIP_BRIEF_INPUT,
  type TripBriefItems,
  updateTripBriefInput,
} from "./trip-brief-input.schema.js";
import type { TripSession } from "./trip-session.js";
import { textReply, writeReplyOrReadableError } from "./tool-reply.js";

// The trip brief tools (tool design, section 2.1).

const NOT_SET = "not set";

export const READ_TRIP_BRIEF_DESCRIPTION =
  'Reads the trip brief. Returns every item, one per line. An item with no value yet shows as "not set".';

export const UPDATE_TRIP_BRIEF_DESCRIPTION =
  "Changes one or more items in the trip brief. Items not given are not changed. Each item given replaces its old value. An item can be changed, but never emptied. If an item is refused, the error says which item and why, with the limit when there is one. The reply doesn't repeat the items. Its feasibility check results also include the trip-wide ones already known.";

export function readTripBriefTool(session: TripSession): StrictToolDefinition {
  return {
    ...strictTool(
      "read_trip_brief",
      READ_TRIP_BRIEF_DESCRIPTION,
      READ_TRIP_BRIEF_INPUT,
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
    updateTripBriefInput(session.settings),
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
            // A brief change touches only the trip as a whole. A day's warning whose
            // text it changed, such as the comfortable driving hours, comes back as
            // changed (tool design 2.1).
            return new Set([trip.itinerary.id]);
          },
        );
        return textReply([
          "Changed the trip brief.",
          ...(result.checkComparison === null
            ? []
            : checkResultLines(result.checkComparison, result.changeResult)),
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
