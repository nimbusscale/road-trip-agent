import type { Settings } from "../config/settings.schema.js";
import type { RouteFinder } from "../domain/route-finder.js";
import type { PlacesClient } from "../google/places-client.js";
import type { PlaceReader } from "../persistence/place-reader.js";

// What the routing tool of one session is given. The trip comes from the session, so a
// place ID can only be one of this trip's places (tool design, section 4).
export interface RoutingSession {
  readonly tripId: string;
  readonly places: PlaceReader;
  // Matches each plain name to a place, without saving it.
  readonly google: Pick<PlacesClient, "matchName">;
  readonly routeFinder: RouteFinder;
  // For the drive buffer, which the reply names.
  readonly settings: Pick<Settings, "driveBufferPercent">;
}
