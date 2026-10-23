import type { PlacesClient } from "../google/places-client.js";
import type { PlaceReader } from "../persistence/place-reader.js";
import type { PlaceWriter } from "../persistence/place-writer.js";
import type { TripReader } from "../persistence/trip-reader.js";

// What the places tools of one session are given. The trip comes from the session, never
// from a tool input, so no agent can reach another trip's places (tool design, section
// 4).
export interface PlacesSession {
  readonly tripId: string;
  // For the trip's rejected places, which find_place marks.
  readonly reader: TripReader;
  readonly places: PlaceReader;
  readonly placeWriter: PlaceWriter;
  readonly google: PlacesClient;
}
