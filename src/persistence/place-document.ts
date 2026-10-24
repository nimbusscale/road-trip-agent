import type { OpeningPeriod } from "../domain/opening-period.js";
import type { Place } from "../domain/place.js";

// A place's row as it's stored, with property names in camelCase, for the plan's stored
// download (persistence design, section 2). Each time of day is text, as in the
// opening_periods column.
export function placeDocumentOf(place: Place): object {
  return {
    id: place.id,
    googlePlaceId: place.googlePlaceId,
    name: place.name,
    type: place.type,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    rating: place.rating,
    reviewCount: place.reviewCount,
    priceLevel: place.priceLevel,
    openingPeriods: place.openingPeriods.map(storedOpeningPeriod),
    weekdayHoursLines: place.weekdayHoursLines,
    summaries: place.summaries,
    links: place.links,
  };
}

export function storedOpeningPeriod(period: OpeningPeriod): object {
  return {
    openDay: period.openDay,
    openTime: period.openTime.toText(),
    closeDay: period.closeDay,
    closeTime: period.closeTime?.toText() ?? null,
  };
}
