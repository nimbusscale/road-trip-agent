import { Place } from "../domain/place.js";
import { newId } from "../ids/new-id.js";
import { googleErrorBodySchema } from "./google-error.schema.js";
import { isTimeoutError, jsonBodyOf } from "./json-body.js";
import {
  alongRouteResponseSchema,
  type NameMatch,
  nameMatchResponseSchema,
  type RouteSummary,
  textSearchResponseSchema,
} from "./places-text-search.schema.js";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Every lookup asks for everything a place keeps, since a place is stored once per trip,
// from its first lookup (Google design 2.1). The fields also set the price of the call
// (section 5). No route lines or photos.
export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryTypeDisplayName",
  // Only to tell a street address from a named place.
  "places.types",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.regularOpeningHours.periods",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.googleMapsUri",
  "places.editorialSummary",
  "places.generativeSummary",
  "places.reviewSummary",
].join(",");

// A search along a route adds each place's drive from the route's start, and on to its
// end (Google design 2.1).
export const ALONG_ROUTE_FIELD_MASK = `${FIELD_MASK},routingSummaries`;

// For a plain name, only enough to route by it and show what it matched. These fields
// make it a Pro call, not an Enterprise one (Google design section 5).
export const NAME_MATCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
].join(",");

// A search that takes longer than this has failed. Google usually answers in about a
// second.
export const TIMEOUT_MILLISECONDS = 10_000;

// Google allows 1 to 20 results per call (Google design 2.1).
export const MAXIMUM_RESULTS = 20;

// The center and radius of a search near a point. The radius biases the results, and
// isn't a limit, so a query that names a farther place still finds it (technical spec
// section 10, the near distance).
export interface NearPoint {
  latitude: number;
  longitude: number;
  radiusInMeters: number;
}

// A route to search along: Google's encoded route line, and where it starts, which the
// drives in each place's summary start from.
export interface RouteToSearch {
  routeLine: string;
  start: { latitude: number; longitude: number };
}

// A place found along a route, with its drives from the route's start and on to its end.
// The route is null when Google gave none for the place.
export interface PlaceAlongRoute {
  place: Place;
  route: RouteSummary | null;
}

export interface PlacesClientOptions {
  // The server key, GOOGLE_MAPS_SERVER_KEY (Google design section 1).
  apiKey: string;
  // The global fetch in the app. Tests pass a fake that returns saved responses.
  fetch: typeof fetch;
}

// A Google call that failed: no answer in time, an error status, or a response that
// isn't what the app expects. The message is written for the agent.
export class GooglePlacesError extends Error {
  override name = "GooglePlacesError";
}

// Calls Places API (New) Text Search (Google design section 2).
export class PlacesClient {
  readonly #options: PlacesClientOptions;

  constructor(options: PlacesClientOptions) {
    this.#options = options;
  }

  // Each match becomes a new place, with a new ID. PlaceWriter.save() stores it, or
  // gives back the place the trip already has (persistence design, section 8.6).
  async searchText(
    textQuery: string,
    maximumResults: number,
  ): Promise<Place[]> {
    return this.#places({ textQuery, pageSize: pageSizeOf(maximumResults) });
  }

  // Places near a point, such as a stay's lodging, ranked by how well they match, not
  // by distance (Google design 2.1).
  async searchNear(
    textQuery: string,
    near: NearPoint,
    maximumResults: number,
  ): Promise<Place[]> {
    return this.#places({
      textQuery,
      pageSize: pageSizeOf(maximumResults),
      locationBias: {
        circle: {
          center: { latitude: near.latitude, longitude: near.longitude },
          radius: near.radiusInMeters,
        },
      },
    });
  }

  // Places along a route, in Google's order. Each new place gets a new ID, as in
  // searchText().
  async searchAlongRoute(
    textQuery: string,
    route: RouteToSearch,
    maximumResults: number,
  ): Promise<PlaceAlongRoute[]> {
    const body = await this.#post(
      {
        textQuery,
        pageSize: pageSizeOf(maximumResults),
        searchAlongRouteParameters: {
          polyline: { encodedPolyline: route.routeLine },
        },
        routingParameters: { origin: route.start },
      },
      ALONG_ROUTE_FIELD_MASK,
    );
    const parsed = alongRouteResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GooglePlacesError(misunderstood(parsed.error.message));
    }
    return parsed.data.map(({ facts, route: summary }) => ({
      place: new Place({ id: newId("place"), ...facts }),
      route: summary,
    }));
  }

  async #places(request: object): Promise<Place[]> {
    const body = await this.#post(request, FIELD_MASK);
    const parsed = textSearchResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GooglePlacesError(misunderstood(parsed.error.message));
    }
    return parsed.data.map(
      (facts) => new Place({ id: newId("place"), ...facts }),
    );
  }

  // The best match for a plain name, such as "Moab, UT", or null when there's none. For
  // compute_route, which saves no places (tool design 2.4).
  async matchName(textQuery: string): Promise<NameMatch | null> {
    const body = await this.#post(
      { textQuery, pageSize: 1 },
      NAME_MATCH_FIELD_MASK,
    );
    const parsed = nameMatchResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GooglePlacesError(misunderstood(parsed.error.message));
    }
    return parsed.data;
  }

  async #post(request: object, fieldMask: string): Promise<unknown> {
    let response: Response;
    let body: unknown;
    try {
      response = await this.#options.fetch(TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The key goes in a header, never in the URL (Google design section 1).
          "X-Goog-Api-Key": this.#options.apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
      });
      // The timeout covers reading the body too.
      body = await jsonBodyOf(response);
    } catch (error) {
      throw new GooglePlacesError(failedCallMessage(error), { cause: error });
    }
    if (!response.ok) {
      const detail = googleErrorBodySchema.safeParse(body);
      throw new GooglePlacesError(
        `Google Places refused the search with status ${String(response.status)}${detail.success ? `, ${detail.data}` : ""}.`,
      );
    }
    return body;
  }
}

function pageSizeOf(maximumResults: number): number {
  return Math.min(Math.max(maximumResults, 1), MAXIMUM_RESULTS);
}

function misunderstood(detail: string): string {
  return `Google Places sent a response the app doesn't understand: ${detail}`;
}

function failedCallMessage(error: unknown): string {
  if (isTimeoutError(error)) {
    return `Google Places didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds. Try again.`;
  }
  return "Google Places couldn't be reached. Try again.";
}
