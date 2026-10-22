import type { PastDay } from "./archive.schema.js";

// 1 mm, which Open-Meteo gives as 0.039 in (Open-Meteo design 2.3).
const PRECIPITATION_DAY_INCHES = 0.039;
// 1 cm, which Open-Meteo gives as 0.394 in.
const SNOW_DAY_INCHES = 0.39;
const HOT_FAHRENHEIT = 90;
const VERY_HOT_FAHRENHEIT = 100;
const FREEZING_FAHRENHEIT = 32;

// One summary of all the days from every year (Open-Meteo design 2.3). Temperatures are
// in whole degrees Fahrenheit, and shares in whole percent. No rain or snow totals,
// since they didn't hold up in testing.
export interface SeasonalAverages {
  firstYear: number;
  lastYear: number;
  averageHighInFahrenheit: number;
  averageLowInFahrenheit: number;
  precipitationDaysPercent: number;
  snowDaysPercent: number;
  daysAt90Percent: number;
  daysAt100Percent: number;
  freezingNightsPercent: number;
  warmestInFahrenheit: number;
  coldestInFahrenheit: number;
}

// Null when there are no days, such as when every year's data is still missing.
export function seasonalAveragesOf(
  days: readonly PastDay[],
  years: { first: number; last: number },
): SeasonalAverages | null {
  if (days.length === 0) {
    return null;
  }
  const highs = days.map((day) => day.highInFahrenheit);
  const lows = days.map((day) => day.lowInFahrenheit);
  const share = (isCounted: (day: PastDay) => boolean): number =>
    Math.round((days.filter(isCounted).length / days.length) * 100);
  return {
    firstYear: years.first,
    lastYear: years.last,
    averageHighInFahrenheit: Math.round(average(highs)),
    averageLowInFahrenheit: Math.round(average(lows)),
    precipitationDaysPercent: share(
      (day) => day.precipitationInInches >= PRECIPITATION_DAY_INCHES,
    ),
    snowDaysPercent: share((day) => day.snowInInches >= SNOW_DAY_INCHES),
    daysAt90Percent: share((day) => day.highInFahrenheit >= HOT_FAHRENHEIT),
    daysAt100Percent: share(
      (day) => day.highInFahrenheit >= VERY_HOT_FAHRENHEIT,
    ),
    freezingNightsPercent: share(
      (day) => day.lowInFahrenheit <= FREEZING_FAHRENHEIT,
    ),
    warmestInFahrenheit: Math.round(Math.max(...highs)),
    coldestInFahrenheit: Math.round(Math.min(...lows)),
  };
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
