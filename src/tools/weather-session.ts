import type { Settings } from "../config/settings.schema.js";
import type { WeatherClient } from "../google/weather-client.js";
import type { ArchiveClient } from "../open-meteo/archive-client.js";
import type { PlaceReader } from "../persistence/place-reader.js";
import type { TripReader } from "../persistence/trip-reader.js";

// What the weather tools of one session are given. The trip comes from the session,
// never from a tool input, so no agent can reach another trip (tool design, section 4).
export interface WeatherSession {
  readonly tripId: string;
  readonly reader: TripReader;
  readonly places: PlaceReader;
  readonly settings: Settings;
  // The current moment, for today's date. The system clock in the app, and a fixed time
  // in tests.
  readonly now: () => Date;
  readonly forecasts: WeatherClient;
  readonly averages: ArchiveClient;
}
