import { Place } from "../domain/place.js";
import { newId } from "../ids/new-id.js";
import { googleErrorBodySchema } from "./google-error.schema.js";
import { jsonBodyOf } from "./json-body.js";
import { textSearchResponseSchema } from "./places-text-search.schema.js";

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

// A search that takes longer than this has failed. Google usually answers in about a
// second.
export const TIMEOUT_MILLISECONDS = 10_000;

// Google allows 1 to 20 results per call (Google design 2.1).
export const MAXIMUM_RESULTS = 20;

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
    const body = await this.#post({
      textQuery,
      pageSize: Math.min(Math.max(maximumResults, 1), MAXIMUM_RESULTS),
    });
    const parsed = textSearchResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GooglePlacesError(
        `Google Places sent a response the app doesn't understand: ${parsed.error.message}`,
      );
    }
    return parsed.data.map(
      (facts) => new Place({ id: newId("place"), ...facts }),
    );
  }

  async #post(request: object): Promise<unknown> {
    let response: Response;
    let body: unknown;
    try {
      response = await this.#options.fetch(TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The key goes in a header, never in the URL (Google design section 1).
          "X-Goog-Api-Key": this.#options.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
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

function failedCallMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `Google Places didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds. Try again.`;
  }
  return "Google Places couldn't be reached. Try again.";
}
