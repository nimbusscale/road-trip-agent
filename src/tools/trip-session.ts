import type { Settings } from "../config/settings.schema.js";
import type { TripReader } from "../persistence/trip-reader.js";
import type { TripWriter } from "../persistence/trip-writer.js";

// What the trip tools of one session are given. The trip comes from the session, never
// from a tool input, so no agent can reach another trip (tool design, section 4).
export interface TripSession {
  readonly tripId: string;
  readonly writer: TripWriter;
  readonly reader: TripReader;
  // For the limits the tools' input descriptions give, and the checks a read runs.
  readonly settings: Settings;
  // The current moment, for today's date in a read. The system clock in the app, and a
  // fixed time in tests.
  readonly now: () => Date;
}
