import { CalendarDate } from "../domain/calendar-date.js";
import type { Place } from "../domain/place.js";
import { googleErrorBodySchema } from "./google-error.schema.js";
import { isTimeoutError, jsonBodyOf } from "./json-body.js";
import {
  forecastResponseSchema,
  type GoogleForecastDay,
} from "./weather-forecast.schema.js";

const FORECAST_URL = "https://weather.googleapis.com/v1/forecast/days:lookup";

// The most days Google gives. Its first day can be yesterday, so asking for all of them
// still reaches 8 days after today (Google design section 3).
export const FORECAST_DAYS_ASKED = 10;

// A forecast that takes longer than this has failed.
export const TIMEOUT_MILLISECONDS = 10_000;

export interface WeatherClientOptions {
  // The server key, GOOGLE_MAPS_SERVER_KEY (Google design section 1).
  apiKey: string;
  // The global fetch in the app. Tests pass a fake that returns saved responses.
  fetch: typeof fetch;
}

// One date's forecast, in Fahrenheit, for the daytime.
export interface ForecastDay {
  date: CalendarDate;
  highInFahrenheit: number;
  lowInFahrenheit: number;
  conditions: string;
  rainChancePercent: number;
  thunderstormChancePercent: number;
}

// A Google call that failed: no answer in time, an error status, or a response that
// isn't what the app expects. The message is written for the agent.
export class GoogleWeatherError extends Error {
  override name = "GoogleWeatherError";
}

// Google's forecast left out one of the dates asked for. The tool doesn't fall back to
// seasonal averages, since the saved text would be labeled a forecast (technical spec
// 6.3).
export class MissingForecastDateError extends GoogleWeatherError {
  override name = "MissingForecastDateError";
}

// Calls the Weather API's daily forecast (Google design section 3).
export class WeatherClient {
  readonly #options: WeatherClientOptions;

  constructor(options: WeatherClientOptions) {
    this.#options = options;
  }

  // One forecast day for each date, in the order given. Each is picked by its date, since
  // the first day Google gives isn't always today.
  async forecastFor(
    place: Place,
    dates: readonly CalendarDate[],
  ): Promise<ForecastDay[]> {
    const body = await this.#get(place);
    const parsed = forecastResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GoogleWeatherError(
        `Google Weather sent a response the app doesn't understand: ${parsed.error.message}`,
      );
    }
    const days = parsed.data.map(forecastDayOf);
    const missing = dates.filter(
      (date) => !days.some((day) => day.date.equals(date)),
    );
    if (missing.length > 0) {
      throw new MissingForecastDateError(
        `Google's forecast doesn't cover every date of this stay yet. It leaves out ${missing.map((date) => date.longText).join(" and ")}. Try again later.`,
      );
    }
    return dates.flatMap((date) => days.filter((day) => day.date.equals(date)));
  }

  async #get(place: Place): Promise<unknown> {
    const url = new URL(FORECAST_URL);
    url.searchParams.set("location.latitude", String(place.latitude));
    url.searchParams.set("location.longitude", String(place.longitude));
    url.searchParams.set("days", String(FORECAST_DAYS_ASKED));
    // Without it, Google gives 5 days and a page token.
    url.searchParams.set("pageSize", String(FORECAST_DAYS_ASKED));
    url.searchParams.set("unitsSystem", "IMPERIAL");
    let response: Response;
    let body: unknown;
    try {
      response = await this.#options.fetch(url.toString(), {
        // The key goes in a header, never in the URL (Google design section 1).
        headers: { "X-Goog-Api-Key": this.#options.apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
      });
      // The timeout covers reading the body too.
      body = await jsonBodyOf(response);
    } catch (error) {
      throw new GoogleWeatherError(failedCallMessage(error), { cause: error });
    }
    if (!response.ok) {
      const detail = googleErrorBodySchema.safeParse(body);
      throw new GoogleWeatherError(
        `Google Weather refused the forecast with status ${String(response.status)}${detail.success ? `, ${detail.data}` : ""}.`,
      );
    }
    return body;
  }
}

function forecastDayOf(day: GoogleForecastDay): ForecastDay {
  const { year, month, day: dayOfMonth } = day.displayDate;
  return {
    date: new CalendarDate(year, month, dayOfMonth),
    highInFahrenheit: day.highInFahrenheit,
    lowInFahrenheit: day.lowInFahrenheit,
    conditions: day.conditions,
    rainChancePercent: day.rainChancePercent,
    thunderstormChancePercent: day.thunderstormChancePercent,
  };
}

function failedCallMessage(error: unknown): string {
  if (isTimeoutError(error)) {
    return `Google Weather didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds. Try again.`;
  }
  return "Google Weather couldn't be reached. Try again.";
}
