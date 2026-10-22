import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { CalendarDate } from "../domain/calendar-date.js";
import {
  at,
  attraction,
  fillDay,
  placeNamed,
  planningFor,
  routeDay,
} from "../domain/example-trip-parts.fake.js";
import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import type { Place } from "../domain/place.js";
import type { Stay } from "../domain/stay.js";
import type { Trip } from "../domain/trip.js";
import { WeatherClient } from "../google/weather-client.js";
import { ArchiveClient } from "../open-meteo/archive-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import type { ToolReply } from "./tool-reply.js";
import { lookUpStayWeatherTool } from "./weather-tools.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// Saved responses (DEVELOPMENT.md section 5). Google's Moab forecast runs from October
// 21 to 30, 2026. Honolulu's was asked for before 7 a.m. there, so it runs from October
// 20 to 29. Leadville's runs from October 21 to 30, with chances of snow. Open-Meteo's are Moab's for October 3 to 20 of 2016 to 2025, by year.
function saved(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const MOAB_FORECAST = saved("../google/saved-responses/forecast-moab.json");
const HONOLULU_FORECAST = saved(
  "../google/saved-responses/forecast-honolulu-before-7am.json",
);
const LEADVILLE_FORECAST = saved(
  "../google/saved-responses/forecast-leadville.json",
);
const MOAB_OCTOBER_BY_YEAR: unknown = JSON.parse(
  saved("../open-meteo/saved-responses/moab-october-10-to-13.json"),
);
const MOAB_OCTOBER = new Map(Object.entries(MOAB_OCTOBER_BY_YEAR ?? {}));
const SPENT_LIMIT = saved("../open-meteo/saved-responses/spent-limit.json");

interface Answers {
  forecast?: string;
  averages?: (year: string) => string;
}

// Answers Google with the forecast given, and Open-Meteo with the saved year asked for.
// Records each host called.
function fetchFor(answers: Answers, hosts: string[]): typeof fetch {
  return (url) => {
    const asked = new URL(typeof url === "string" ? url : "");
    hosts.push(asked.host);
    const year = asked.searchParams.get("start_date")?.slice(0, 4) ?? "";
    const body = asked.host.startsWith("weather.")
      ? (answers.forecast ?? MOAB_FORECAST)
      : (answers.averages?.(year) ?? JSON.stringify(MOAB_OCTOBER.get(year)));
    return Promise.resolve(new Response(body));
  };
}

interface Fixture {
  trip: Trip;
  moab: Stay;
  torrey: Stay;
  hosts: string[];
  call: (input: unknown) => Promise<ToolReply>;
}

// The Moab trip, starting on October 10, 2027 unless a start date is given, with a
// stargazing stop at 1 a.m. after the Torrey day. Today is `now`.
async function moabTrip(
  now: Date,
  options: { startDate?: CalendarDate; answers?: Answers } = {},
): Promise<Fixture> {
  const fixture = setUp();
  const settings = loadSettings(SETTINGS_PATH);
  const { trip, places, moab } = exampleMoabTrip(OWNER);
  const planning = planningFor(trip, now);
  if (options.startDate !== undefined) {
    planning.services.itinerary.setStartDate(trip.itinerary, options.startDate);
  }
  const torrey = trip.itinerary.stays[1];
  if (torrey === undefined) {
    throw new Error("The Moab trip has a Torrey stay.");
  }
  const panoramaPoint = placeNamed("Panorama Point");
  fillDay(planning, torrey.days[0], [
    [
      attraction({
        purpose: "stargazing",
        searchArea: "nearStay",
        stay: torrey,
        setTime: at("01:00", true),
      }),
      panoramaPoint,
      60,
    ],
  ]);
  // Routed, so the stop's time is known. Torrey's day runs late, to 1 a.m.
  routeDay(planning.calendar, trip.itinerary, torrey.days[0], [600, 10]);
  await fixture.store.add(trip);
  fixture.store.places.rows.push(
    ...[...places, panoramaPoint].map((place: Place) => ({
      tripId: trip.id,
      place,
    })),
  );
  const hosts: string[] = [];
  const fetchFake = fetchFor(options.answers ?? {}, hosts);
  const tool = lookUpStayWeatherTool({
    tripId: trip.id,
    reader: fixture.reader,
    places: new PlaceReader({
      pool: fixture.pool,
      makeStore: () => fixture.store.places,
    }),
    settings,
    now: () => now,
    forecasts: new WeatherClient({
      apiKey: "test-server-key",
      fetch: fetchFake,
    }),
    averages: new ArchiveClient({ fetch: fetchFake }),
  });
  return { trip, moab, torrey, hosts, call: (input) => tool.handler(input) };
}

function textOf(reply: ToolReply): string {
  return reply.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

// On October 21, 2026 at 10 a.m. in Grand Junction.
const OCTOBER_21 = new Date("2026-10-21T16:00:00Z");

describe("look_up_stay_weather", () => {
  it("gives seasonal averages for a stay in October 2027, labeled with the years they come from", async () => {
    const { moab, hosts, call } = await moabTrip(OCTOBER_21);
    const reply = await call({ stayId: moab.id, placeId: moab.place.id });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply).split("\n")).toEqual([
      `Weather at Moab (${moab.place.id}) for the Moab stay (${moab.id}), Sunday, October 10, 2027 to Wednesday, October 13, 2027.`,
      "Typical for this time of year, based on 2016–2025. Seasonal averages from Open-Meteo, not a forecast. Each share is of the days within a week of the stay's dates in those years.",
      "- Average high: 71°F. Average low: 47°F.",
      "- Days with rain or snow: 14%. Days with snow: 0%.",
      "- Days at or above 90°F: 1%. At or above 100°F: 0%.",
      "- Nights at or below 32°F: 2%.",
      "- Warmest seen: 90°F. Coldest seen: 27°F.",
      "The stay's activities:",
      expect.stringMatching(
        /^- Fisher Towers \(place_\w+\): Sunday, October 10, 2027, 9:45 a\.m\. to 10:45 a\.m\.$/,
      ),
      "- a sunrise hike, no place picked yet: Monday, October 11, 2027, 6:00 a.m.",
    ]);
    expect(new Set(hosts)).toEqual(new Set(["archive-api.open-meteo.com"]));
  });

  it("gives Google's forecast when every one of the stay's dates is within 7 days", async () => {
    const { moab, hosts, call } = await moabTrip(OCTOBER_21, {
      startDate: new CalendarDate(2026, 10, 23),
    });
    const text = textOf(
      await call({ stayId: moab.id, placeId: moab.place.id }),
    );
    expect(text.split("\n").slice(0, 6)).toEqual([
      `Weather at Moab (${moab.place.id}) for the Moab stay (${moab.id}), Friday, October 23, 2026 to Monday, October 26, 2026.`,
      "Forecast, from Google Weather. Conditions and chances are for the daytime.",
      "- Friday, October 23, 2026: high 66°F, low 44°F. Sunny. 15% chance of rain, 10% chance of thunderstorms.",
      "- Saturday, October 24, 2026: high 57°F, low 44°F. Chance of showers. 45% chance of rain, 10% chance of thunderstorms.",
      "- Sunday, October 25, 2026: high 59°F, low 41°F. Mostly cloudy. 20% chance of rain, 10% chance of thunderstorms.",
      "- Monday, October 26, 2026: high 62°F, low 39°F. Sunny. 5% chance of rain, 0% chance of thunderstorms.",
    ]);
    expect(hosts).toEqual(["weather.googleapis.com"]);
  });

  it("says when the chance is of snow", async () => {
    // Leadville's forecast, given for Moab, since only what the line says matters here.
    const { moab, call } = await moabTrip(OCTOBER_21, {
      startDate: new CalendarDate(2026, 10, 23),
      answers: { forecast: LEADVILLE_FORECAST },
    });
    const text = textOf(
      await call({ stayId: moab.id, placeId: moab.place.id }),
    );
    expect(text).toContain(
      "- Saturday, October 24, 2026: high 39°F, low 30°F. Snow. 40% chance of snow, 20% chance of thunderstorms.",
    );
  });

  it("gives seasonal averages when any date is 8 days away, counting today as day 0", async () => {
    // Torrey's dates are October 29 and 30, days 7 and 8 on October 22.
    const { torrey, hosts, call } = await moabTrip(
      new Date("2026-10-22T16:00:00Z"),
      { startDate: new CalendarDate(2026, 10, 26) },
    );
    const text = textOf(
      await call({ stayId: torrey.id, placeId: torrey.place.id }),
    );
    expect(text).toContain(
      "Typical for this time of year, based on 2016–2025.",
    );
    expect(hosts).not.toContain("weather.googleapis.com");
  });

  it("counts a day of only snow as a day with rain or snow, since precipitation_sum includes snowfall", async () => {
    // Open-Meteo's names, so it's written as JSON. 1 in of snow is about 0.1 in of water.
    const snowOnly =
      '{"daily":{"time":["2025-10-10"],"temperature_2m_max":[28],"temperature_2m_min":[12],"precipitation_sum":[0.1],"snowfall_sum":[1]}}';
    const { moab, call } = await moabTrip(OCTOBER_21, {
      answers: { averages: () => snowOnly },
    });
    const text = textOf(
      await call({ stayId: moab.id, placeId: moab.place.id }),
    );
    expect(text).toContain(
      "- Days with rain or snow: 100%. Days with snow: 100%.",
    );
  });

  it("gives an activity after midnight on the date it falls on", async () => {
    const { torrey, call } = await moabTrip(OCTOBER_21);
    const text = textOf(
      await call({ stayId: torrey.id, placeId: torrey.place.id }),
    );
    expect(text).toMatch(
      /- Panorama Point \(place_\w+\): Thursday, October 14, 2027, 1:00 a\.m\. to 2:00 a\.m\.$/,
    );
  });

  it("returns an error, not seasonal averages, when the forecast leaves out a date", async () => {
    // Moab's dates are October 27 to 30. The forecast ends on October 29.
    const { moab, hosts, call } = await moabTrip(
      new Date("2026-10-23T16:00:00Z"),
      {
        startDate: new CalendarDate(2026, 10, 27),
        answers: { forecast: HONOLULU_FORECAST },
      },
    );
    const reply = await call({ stayId: moab.id, placeId: moab.place.id });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      "Google's forecast doesn't cover every date of this stay yet. It leaves out Friday, October 30, 2026. Try again later.",
    );
    expect(hosts).not.toContain("archive-api.open-meteo.com");
  });

  it("returns Open-Meteo's reason when its limit is spent", async () => {
    const { moab, call } = await moabTrip(OCTOBER_21, {
      answers: { averages: () => SPENT_LIMIT },
    });
    const reply = await call({ stayId: moab.id, placeId: moab.place.id });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      'Seasonal averages are unavailable right now. Open-Meteo said: "Minutely API request limit exceeded. Please try again in one minute."',
    );
  });

  it("refuses an ID of the wrong kind, or one the trip doesn't have", async () => {
    const { trip, moab, call } = await moabTrip(OCTOBER_21);
    const dayId = trip.itinerary.days[0]?.id ?? "";
    const wrongKind = await call({ stayId: dayId, placeId: moab.place.id });
    expect(textOf(wrongKind)).toBe(`${dayId} is a day ID, not a stay ID.`);
    const noStay = await call({
      stayId: "stay_zzzzzzzz",
      placeId: moab.place.id,
    });
    expect(textOf(noStay)).toBe("This trip has no stay stay_zzzzzzzz.");
    const noPlace = await call({ stayId: moab.id, placeId: "place_zzzzzzzz" });
    expect(noPlace.isError).toBe(true);
    expect(textOf(noPlace)).toBe("This trip has no place place_zzzzzzzz.");
    const placeForStay = await call({ stayId: moab.id, placeId: moab.id });
    expect(textOf(placeForStay)).toBe(
      `${moab.id} is a stay ID, not a place ID.`,
    );
  });
});
