import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { examplePlace } from "../domain/place.fake.js";
import { bodyThatTimesOut } from "./failing-body.fake.js";
import {
  GoogleWeatherError,
  MissingForecastDateError,
  WeatherClient,
} from "./weather-client.js";

const API_KEY = "test-server-key";

// Responses Google gave on 2026-10-21 at 15:37 UTC. Moab's starts on today, October 21.
// Honolulu's was asked for at 5:37 a.m. there, before Google's forecast day starts at
// 7 a.m., so it starts on yesterday, October 20 (Google design section 3).
function savedResponse(name: string): string {
  return readFileSync(
    new URL(`saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

const MOAB = examplePlace({
  name: "Moab",
  latitude: 38.5733,
  longitude: -109.5498,
});

function october(day: number): CalendarDate {
  return new CalendarDate(2026, 10, day);
}

function clientFor(
  body: string | ReadableStream<Uint8Array>,
  status = 200,
): {
  client: WeatherClient;
  sent: { url: string; init: RequestInit | undefined }[];
} {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFake: typeof fetch = (url, init) => {
    sent.push({ url: typeof url === "string" ? url : "not a string", init });
    return Promise.resolve(new Response(body, { status }));
  };
  return {
    client: new WeatherClient({ apiKey: API_KEY, fetch: fetchFake }),
    sent,
  };
}

describe("WeatherClient.forecastFor", () => {
  it("asks for 10 days at the place in Fahrenheit, with the key in a header", async () => {
    const { client, sent } = clientFor(savedResponse("forecast-moab"));
    await client.forecastFor(MOAB, [october(22)]);
    const url = new URL(sent[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe(
      "https://weather.googleapis.com/v1/forecast/days:lookup",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      "location.latitude": "38.5733",
      "location.longitude": "-109.5498",
      days: "10",
      pageSize: "10",
      unitsSystem: "IMPERIAL",
    });
    expect(sent[0]?.url).not.toContain(API_KEY);
    expect(sent[0]?.init?.headers).toEqual({ "X-Goog-Api-Key": API_KEY });
  });

  it("gives each date's daytime forecast, in the order of the dates", async () => {
    const { client } = clientFor(savedResponse("forecast-moab"));
    const days = await client.forecastFor(MOAB, [october(22), october(23)]);
    expect(days).toEqual([
      {
        date: october(22),
        highInFahrenheit: 58.4,
        lowInFahrenheit: 52.3,
        conditions: "Heavy rain",
        rainChancePercent: 75,
        thunderstormChancePercent: 30,
      },
      {
        date: october(23),
        highInFahrenheit: 66.1,
        lowInFahrenheit: 43.8,
        conditions: "Sunny",
        rainChancePercent: 15,
        thunderstormChancePercent: 10,
      },
    ]);
  });

  it("picks dates by their date, since before 7 a.m. the first day is yesterday", async () => {
    const { client } = clientFor(savedResponse("forecast-honolulu-before-7am"));
    const days = await client.forecastFor(MOAB, [october(21), october(29)]);
    expect(days.map((day) => day.date)).toEqual([october(21), october(29)]);
    expect(days[0]?.highInFahrenheit).toBe(81.4);
  });

  it("refuses a forecast that leaves out a date, and names it", async () => {
    const { client } = clientFor(savedResponse("forecast-honolulu-before-7am"));
    const forecast = client.forecastFor(MOAB, [october(29), october(30)]);
    await expect(forecast).rejects.toThrow(MissingForecastDateError);
    await expect(forecast).rejects.toThrow(
      "Google's forecast doesn't cover every date of this stay yet. It leaves out Friday, October 30, 2026. Try again later.",
    );
  });

  it("counts a chance Google leaves out as 0%", async () => {
    const { client } = clientFor(
      JSON.stringify({
        forecastDays: [
          {
            displayDate: { year: 2026, month: 10, day: 22 },
            maxTemperature: { degrees: 60 },
            minTemperature: { degrees: 40 },
            daytimeForecast: {
              weatherCondition: { description: { text: "Sunny" } },
            },
          },
        ],
      }),
    );
    const [day] = await client.forecastFor(MOAB, [october(22)]);
    expect(day?.rainChancePercent).toBe(0);
    expect(day?.thunderstormChancePercent).toBe(0);
  });

  it("refuses an error status with Google's reason, and a response it doesn't understand", async () => {
    const refused = clientFor(
      JSON.stringify({
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Request contains an invalid argument.",
        },
      }),
      400,
    );
    await expect(
      refused.client.forecastFor(MOAB, [october(22)]),
    ).rejects.toThrow(
      "Google Weather refused the forecast with status 400, INVALID_ARGUMENT: Request contains an invalid argument.",
    );
    const odd = clientFor(JSON.stringify({ forecastDays: "many" }));
    await expect(odd.client.forecastFor(MOAB, [october(22)])).rejects.toThrow(
      GoogleWeatherError,
    );
  });

  it("refuses a call whose time runs out", async () => {
    const { client } = clientFor(bodyThatTimesOut());
    await expect(client.forecastFor(MOAB, [october(22)])).rejects.toThrow(
      "Google Weather didn't answer within 10 seconds. Try again.",
    );
  });
});
