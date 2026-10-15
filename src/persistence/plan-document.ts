import { Itinerary } from "../domain/itinerary.js";
import { LastDay } from "../domain/last-day.js";
import { textOf, timeOfDayFrom } from "../domain/time-of-day.js";
import { Trip } from "../domain/trip.js";
import { TripBrief } from "../domain/trip-brief.js";
import type { PlanDocument } from "./plan.schema.js";
import type { TripRow } from "./trip-row.schema.js";

// Turns a trip into its plan document, and a parsed row back into a trip. The objects'
// constructors run their own rules, so a stored value that breaks one fails the load.

export function planDocumentOf(trip: Trip): PlanDocument {
  const brief = trip.tripBrief;
  return {
    tripBrief: {
      id: brief.id,
      focus: brief.focus,
      tripLengthInDays: brief.tripLengthInDays,
      interestsText: brief.interestsText,
      mustSeesText: brief.mustSeesText,
      comfortableDrivingInHours: brief.comfortableDrivingInHours,
      routePreference: brief.routePreference,
      restDaysText: brief.restDaysText,
      usualStartTime: textOf(brief.usualStartTime),
      defaultTier: brief.defaultTier,
      budgetRulesText: brief.budgetRulesText,
      mealPreferencesText: brief.mealPreferencesText,
    },
    itinerary: {
      id: trip.itinerary.id,
      lastDay: { id: trip.itinerary.lastDay.id },
    },
    lastUpdatedDateTime: trip.lastUpdatedDateTime.toISOString(),
  };
}

export function tripFromRow(row: TripRow): Trip {
  const plan = row.plan;
  return new Trip({
    id: row.id,
    owner: { id: row.ownerId },
    tripBrief: new TripBrief({
      ...plan.tripBrief,
      usualStartTime: timeOfDayFrom(
        plan.tripBrief.usualStartTime,
        "The trip brief's usualStartTime",
      ),
    }),
    itinerary: new Itinerary({
      id: plan.itinerary.id,
      lastDay: new LastDay(plan.itinerary.lastDay.id),
    }),
    lastUpdatedDateTime: new Date(plan.lastUpdatedDateTime),
  });
}
