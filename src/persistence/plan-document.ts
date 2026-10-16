import type { Place } from "../domain/place.js";
import { itineraryFromStored } from "../domain/stored-itinerary.js";
import { Trip } from "../domain/trip.js";
import { TripBrief } from "../domain/trip-brief.js";
import { itineraryDocumentOf } from "./itinerary-document.js";
import type { PlanDocumentText } from "./plan.schema.js";
import type { TripRow } from "./trip-row.schema.js";

// Turns a trip into its plan document, and a parsed row back into a trip. The objects'
// constructors run their own rules, so a stored value that breaks one fails the load.
// The plan links to places by ID, so the load is given the trip's places.

export function planDocumentOf(trip: Trip): PlanDocumentText {
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
      usualStartTime: brief.usualStartTime.toText(),
      defaultTier: brief.defaultTier,
      budgetRulesText: brief.budgetRulesText,
      mealPreferencesText: brief.mealPreferencesText,
    },
    itinerary: itineraryDocumentOf(trip.itinerary),
    lastUpdatedDateTime: trip.lastUpdatedDateTime.toISOString(),
  };
}

export function tripFromRow(row: TripRow, places: readonly Place[]): Trip {
  const plan = row.plan;
  return new Trip({
    id: row.id,
    owner: { id: row.ownerId },
    tripBrief: new TripBrief(plan.tripBrief),
    itinerary: itineraryFromStored(plan.itinerary, placeLookup(places)),
    lastUpdatedDateTime: new Date(plan.lastUpdatedDateTime),
  });
}

// A link to a place the trip doesn't have means the stored plan is broken.
function placeLookup(places: readonly Place[]): (placeId: string) => Place {
  const byId = new Map(places.map((place) => [place.id, place]));
  return (placeId) => {
    const place = byId.get(placeId);
    if (place === undefined) {
      throw new Error(
        `The stored plan links to a place the trip doesn't have: ${placeId}.`,
      );
    }
    return place;
  };
}
