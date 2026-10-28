import { PLANNED_AT } from "../domain/example-trip-parts.fake.js";
import { WeatherClient } from "../google/weather-client.js";
import { ArchiveClient } from "../open-meteo/archive-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import type { setUp } from "../persistence/trip-writer.fake.js";
import type { WeatherSession } from "./weather-session.js";

const NO_WEATHER: typeof fetch = () => Promise.resolve(new Response("{}"));

// What a session's weather tool is given, for tests, over the same fake store as the
// trip's (DEVELOPMENT.md section 5). Google and Open-Meteo are the fetch given, which
// answers with nothing unless a test gives one that does. The clock is stopped when the
// example trips are planned.
export function fakeWeatherAccess(
  fixture: ReturnType<typeof setUp>,
  fetchFake: typeof fetch = NO_WEATHER,
): Omit<WeatherSession, "tripId"> {
  return {
    reader: fixture.reader,
    places: new PlaceReader({
      pool: fixture.pool,
      makeStore: () => fixture.store.places,
    }),
    settings: fixture.settings,
    now: () => PLANNED_AT,
    forecasts: new WeatherClient({
      apiKey: "test-server-key",
      fetch: fetchFake,
    }),
    averages: new ArchiveClient({ fetch: fetchFake }),
  };
}
