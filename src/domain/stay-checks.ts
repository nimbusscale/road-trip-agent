import type { CheckContext } from "./check-context.js";
import { CheckResult } from "./check-result.js";
import { placeText } from "./check-text.js";
import type { CheckKind } from "./check-kind.js";
import type { Stay } from "./stay.js";
import { FORECAST_DAYS } from "./stays-service.js";

// The checks about the trip as a whole and each stay: trip length vs the brief, weather
// out of date, forecast now available, and stay tier set for different nights
// (technical spec section 8).
export function tripAndStayCheckResults(context: CheckContext): CheckResult[] {
  const tripLength = tripLengthResult(context);
  return [
    ...(tripLength === null ? [] : [tripLength]),
    ...context.itinerary.stays.flatMap((stay) =>
      [
        weatherResult(context, stay),
        forecastResult(context, stay),
        tierResult(stay),
      ].filter((result) => result !== null),
    ),
  ];
}

// Skipped while the brief has no trip length.
function tripLengthResult(context: CheckContext): CheckResult | null {
  const wanted = context.tripBrief.tripLengthInDays;
  const { itinerary } = context;
  if (wanted === null || itinerary.dayCount === wanted) {
    return null;
  }
  return resultFor(
    "tripLengthVsBrief",
    itinerary.id,
    `The trip is ${daysText(itinerary.dayCount)}, and the brief asks for ${String(wanted)}.`,
  );
}

function weatherResult(context: CheckContext, stay: Stay): CheckResult | null {
  if (!context.calendar.isWeatherOutOfDate(context.itinerary, stay)) {
    return null;
  }
  const text =
    stay.weatherText === null
      ? `${townOf(stay)} has no weather text yet, though other stays do.`
      : `${townOf(stay)}'s weather text no longer matches its place, dates, or activities.`;
  return resultFor("weatherOutOfDate", stay.id, text);
}

// Seasonal averages that could now be a forecast: every one of the stay's dates is
// within 7 days, counting today as day 0. Not given once the trip has started, since
// nothing can be rewritten then.
function forecastResult(context: CheckContext, stay: Stay): CheckResult | null {
  const { itinerary, calendar } = context;
  const today = calendar.today(itinerary);
  const startDate = itinerary.startDate;
  const dates = calendar.datesOf(itinerary, stay);
  if (
    stay.weatherText?.label !== "seasonalAverages" ||
    today === null ||
    startDate === null ||
    today.compareTo(startDate) >= 0 ||
    dates.length === 0 ||
    !dates.every((date) => date.compareTo(today) <= FORECAST_DAYS)
  ) {
    return null;
  }
  return resultFor(
    "forecastNowAvailable",
    stay.id,
    `${townOf(stay)}'s weather text is seasonal averages, and its dates are now close enough for a forecast.`,
  );
}

// A rule like "mid-range for stays of 2+ nights" depends on the nights.
function tierResult(stay: Stay): CheckResult | null {
  const setFor = stay.tierSetForNightCount;
  if (setFor === stay.nightCount) {
    return null;
  }
  return resultFor(
    "stayTierSetForDifferentNights",
    stay.id,
    `${townOf(stay)}'s nights changed from ${String(setFor)} to ${String(stay.nightCount)}. Its tier was set for ${String(setFor)}.`,
  );
}

// Such as "1 day" or "5 days".
function daysText(count: number): string {
  return count === 1 ? "1 day" : `${String(count)} days`;
}

function townOf(stay: Stay): string {
  return placeText(stay.place);
}

function resultFor(
  check: CheckKind,
  subjectId: string,
  text: string,
): CheckResult {
  return new CheckResult({
    check,
    subjectId,
    text,
    isApproved: false,
    hasUnselectedStopBefore: false,
  });
}
