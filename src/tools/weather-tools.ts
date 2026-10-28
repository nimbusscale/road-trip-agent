import type { CalendarDate } from "../domain/calendar-date.js";
import { placeText, stayText } from "../domain/check-text.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stay } from "../domain/stay.js";
import { calendarAndServicesFor } from "../domain/trip-services.js";
import type { ForecastDay } from "../google/weather-client.js";
import type { SeasonalAverages } from "../open-meteo/seasonal-averages.js";
import { refuseWrongKind } from "./id-kind.js";
import { LOOK_UP_STAY_WEATHER_INPUT } from "./look-up-stay-weather-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";
import type { WeatherSession } from "./weather-session.js";

// The weather tool (tool design, section 2.5).

export const LOOK_UP_STAY_WEATHER_DESCRIPTION =
  "Looks up the weather at a place for a stay's dates. When every one of the stay's dates is within 7 days of today, it returns Google's daily forecast. Otherwise it returns seasonal averages from the last 10 years. When the forecast leaves out any of the stay's dates, the reply is an error, not seasonal averages.";

export function lookUpStayWeatherTool(
  session: WeatherSession,
): StrictToolDefinition {
  return {
    ...strictTool(
      "look_up_stay_weather",
      LOOK_UP_STAY_WEATHER_DESCRIPTION,
      LOOK_UP_STAY_WEATHER_INPUT,
      ({ stayId, placeId }) =>
        readReplyOrReadableError(async () => {
          refuseWrongKind(stayId, "stay");
          refuseWrongKind(placeId, "place");
          const [trip, place] = await Promise.all([
            session.reader.read(session.tripId),
            session.places.get(session.tripId, placeId),
          ]);
          const { services } = calendarAndServicesFor(
            trip,
            session.settings,
            session.now,
          );
          const itinerary = trip.itinerary;
          const stay = stayWithId(itinerary, stayId);
          const { today, dates, label } = services.stays.weatherFor(
            itinerary,
            stay,
          );
          const weatherLines =
            label === "forecast"
              ? forecastLines(await session.forecasts.forecastFor(place, dates))
              : averagesLines(
                  await session.averages.seasonalAverages(place, dates, today),
                );
          return textReply([headerLine(stay, place, dates), ...weatherLines]);
        }),
    ),
    annotations: { readOnlyHint: true },
  };
}

function stayWithId(itinerary: Itinerary, stayId: string): Stay {
  const stay = itinerary.stays.find((each) => each.id === stayId);
  if (stay === undefined) {
    throw new RuleError(`This trip has no stay ${stayId}.`);
  }
  return stay;
}

// Such as "Weather at Moab (place_…) for the Moab stay (stay_…), Sunday, October 10, 2027
// to Wednesday, October 13, 2027."
function headerLine(
  stay: Stay,
  place: Place,
  dates: readonly CalendarDate[],
): string {
  const first = dates[0];
  const last = dates.at(-1);
  const span =
    first === undefined || last === undefined
      ? ""
      : `, ${first.longText} to ${last.longText}`;
  return `Weather at ${placeText(place)} (${place.id}) for ${stayText(stay)} (${stay.id})${span}.`;
}

function forecastLines(days: readonly ForecastDay[]): string[] {
  return [
    "Forecast, from Google Weather. Conditions and chances are for the daytime.",
    ...days.map(
      (day) =>
        `- ${day.date.longText}: high ${degrees(day.highInFahrenheit)}, low ${degrees(day.lowInFahrenheit)}. ${day.conditions}. ${String(day.precipitationChancePercent)}% chance of ${day.precipitation}, ${String(day.thunderstormChancePercent)}% chance of thunderstorms.`,
    ),
  ];
}

// The label is the one the itinerary shows, so averages are never mistaken for a
// forecast (Open-Meteo design 2.3).
function averagesLines(averages: SeasonalAverages): string[] {
  return [
    `Typical for this time of year, based on ${String(averages.firstYear)}–${String(averages.lastYear)}. Seasonal averages from Open-Meteo, not a forecast. Each share is of the days within a week of the stay's dates in those years.`,
    `- Average high: ${degrees(averages.averageHighInFahrenheit)}. Average low: ${degrees(averages.averageLowInFahrenheit)}.`,
    `- Days with rain: ${percent(averages.rainDaysPercent)}. Days with snow: ${percent(averages.snowDaysPercent)}.`,
    `- Days at or above 90°F: ${percent(averages.daysAt90Percent)}. At or above 100°F: ${percent(averages.daysAt100Percent)}.`,
    `- Nights at or below 32°F: ${percent(averages.freezingNightsPercent)}.`,
    `- Warmest seen: ${degrees(averages.warmestInFahrenheit)}. Coldest seen: ${degrees(averages.coldestInFahrenheit)}.`,
  ];
}

function degrees(fahrenheit: number): string {
  return `${String(Math.round(fahrenheit))}°F`;
}

function percent(value: number): string {
  return `${String(value)}%`;
}
