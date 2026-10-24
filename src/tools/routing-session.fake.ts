import { PlacesClient } from "../google/places-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import type { setUp } from "../persistence/trip-writer.fake.js";
import type { RoutingSession } from "./routing-session.js";

const NO_MATCHES: typeof fetch = () => Promise.resolve(new Response("{}"));

// What a session's routing tool is given, for tests, over the same fake store and route
// finder as the trip's (DEVELOPMENT.md section 5). Google Places is the fetch given,
// which matches no plain name unless a test gives one that does.
export function fakeRoutingAccess(
  fixture: ReturnType<typeof setUp>,
  fetchFake: typeof fetch = NO_MATCHES,
): Omit<RoutingSession, "tripId"> {
  return {
    places: new PlaceReader({
      pool: fixture.pool,
      makeStore: () => fixture.store.places,
    }),
    google: new PlacesClient({ apiKey: "test-server-key", fetch: fetchFake }),
    routeFinder: fixture.routeFinder,
    settings: fixture.settings,
  };
}
