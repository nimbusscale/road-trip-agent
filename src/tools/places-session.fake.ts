import { PlacesClient } from "../google/places-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import { PlaceWriter } from "../persistence/place-writer.js";
import type { setUp } from "../persistence/trip-writer.fake.js";
import type { PlacesSession } from "./places-session.js";

const NO_MATCHES: typeof fetch = () => Promise.resolve(new Response("{}"));

// What a session's places tools are given, for tests, over the same fake store as the
// trip's (DEVELOPMENT.md section 5). Google is the fetch given, which finds no matches
// unless a test gives one that does.
export function fakePlacesAccess(
  fixture: ReturnType<typeof setUp>,
  fetchFake: typeof fetch = NO_MATCHES,
): Omit<PlacesSession, "tripId"> {
  const makeStore = () => fixture.store.places;
  return {
    reader: fixture.reader,
    places: new PlaceReader({ pool: fixture.pool, makeStore }),
    placeWriter: new PlaceWriter({ pool: fixture.pool, makeStore }),
    google: new PlacesClient({ apiKey: "test-server-key", fetch: fetchFake }),
  };
}
