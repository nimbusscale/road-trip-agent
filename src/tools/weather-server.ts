import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { WeatherClient } from "../google/weather-client.js";
import { ArchiveClient } from "../open-meteo/archive-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import { PlaceRepository } from "../persistence/place-repository.js";
import type { Queryable } from "../persistence/queryable.js";
import { TripReader } from "../persistence/trip-reader.js";
import { TripRepository } from "../persistence/trip-repository.js";
import { stayWeatherTool } from "./weather-tools.js";
import type { WeatherSession } from "./weather-session.js";

// Part of every tool name the model sees, such as mcp__weather__stay_weather (tool
// design, section 1).
export const WEATHER_SERVER_NAME = "weather";

export interface WeatherAccessGiven {
  env: Env;
  pool: Queryable;
  settings: Settings;
}

// What every session's weather server shares, made once when the app starts. The
// forecast comes from Google Weather, and seasonal averages from Open-Meteo (tool design,
// section 1).
export function weatherAccessFor(
  given: WeatherAccessGiven,
): Omit<WeatherSession, "tripId"> {
  const { env, pool, settings } = given;
  return {
    reader: new TripReader(
      pool,
      (connection) => new TripRepository(connection),
    ),
    places: new PlaceReader({
      pool,
      makeStore: (connection) => new PlaceRepository(connection),
    }),
    settings,
    now: () => new Date(),
    forecasts: new WeatherClient({ apiKey: env.googleMapsServerKey, fetch }),
    averages: new ArchiveClient({ fetch }),
  };
}

// Made for each session, with its trip already set. One server object can't be shared
// by two sessions running at once (tool design, section 4). It has one tool, so it needs
// no instructions of its own.
export function createWeatherServer(
  session: WeatherSession,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: WEATHER_SERVER_NAME,
    // The weather worker calls it for every stay, so it's never left for a tool search.
    alwaysLoad: true,
    tools: [stayWeatherTool(session)],
  });
}
