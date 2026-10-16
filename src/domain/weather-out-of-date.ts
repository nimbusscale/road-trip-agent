import type { CalendarDate } from "./calendar-date.js";
import type { Place } from "./place.js";
import type { Stop } from "./stop.js";
import type { WeatherText } from "./weather-text.js";

// Seasonal averages are built from the written dates plus this many days on each side
// (Open-Meteo design 2.2).
const SEASONAL_WINDOW_DAYS = 7;

// What the calendar's isWeatherOutOfDate() compares with a stay's weather text (domain
// model 4.1, "When weather text is out of date").
export interface StayNow {
  place: Place;
  dates: readonly CalendarDate[];
  activities: readonly Stop[];
}

export function isTextOutOfDate(text: WeatherText, now: StayNow): boolean {
  return (
    text.writtenForPlace.id !== now.place.id ||
    !haveSameActivities(text, now.activities) ||
    !datesStillFit(text, now.dates)
  );
}

// Compared as pairs of stop ID and selected place, in any order.
function haveSameActivities(
  text: WeatherText,
  activities: readonly Stop[],
): boolean {
  const written = text.writtenForActivities.map((record) =>
    pairKey(record.stopId, record.selectedPlace),
  );
  const current = activities.map((stop) =>
    pairKey(stop.id, stop.selectedPlace),
  );
  return sameItems(written, current);
}

// A forecast is out of date with any change to the dates. Seasonal averages only when
// a date falls outside the window they were built from.
function datesStillFit(
  text: WeatherText,
  dates: readonly CalendarDate[],
): boolean {
  const written = text.writtenForDates;
  if (text.label === "forecast") {
    return (
      written.length === dates.length &&
      written.every((date, index) => {
        const current = dates[index];
        return current !== undefined && date.equals(current);
      })
    );
  }
  const first = written[0];
  const last = written.at(-1);
  if (first === undefined || last === undefined) {
    return dates.length === 0;
  }
  return dates.every(
    (date) =>
      date.compareTo(first) >= -SEASONAL_WINDOW_DAYS &&
      date.compareTo(last) <= SEASONAL_WINDOW_DAYS,
  );
}

function pairKey(stopId: string, place: Place | null): string {
  return `${stopId} ${place?.id ?? ""}`;
}

function sameItems(
  first: readonly string[],
  second: readonly string[],
): boolean {
  const sortedSecond = [...second].sort();
  return (
    first.length === second.length &&
    [...first].sort().every((item, index) => item === sortedSecond[index])
  );
}
