import type {
  BestOrder,
  FoundRoute,
  RoutablePlace,
  RouteFinder,
  RoutePath,
  RoutePoint,
  StopsPath,
} from "../domain/route-finder.js";
import { googleErrorBodySchema } from "./google-error.schema.js";
import { isTimeoutError, jsonBodyOf } from "./json-body.js";
import { type GoogleRoute, routesResponseSchema } from "./routes.schema.js";

const COMPUTE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

// What a leg keeps (domain model 3.8), and each segment's distance, which compute_route
// shows (tool design 2.4). The fields also set the price of the call (Google design
// section 5). These are all basic fields.
export const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.legs.duration",
  "routes.legs.distanceMeters",
  "routes.polyline.encodedPolyline",
].join(",");

// Asking for the best order makes it a Routes Pro call.
export const BEST_ORDER_FIELD_MASK = `${FIELD_MASK},routes.optimizedIntermediateWaypointIndex`;

// A route that takes longer than this has failed. The write holds the trip's row lock
// while it waits (persistence design, section 4).
export const TIMEOUT_MILLISECONDS = 10_000;

const METERS_PER_MILE = 1609.344;
const SECONDS_PER_MINUTE = 60;

export interface RoutesClientOptions {
  // The server key, GOOGLE_MAPS_SERVER_KEY (Google design section 1).
  apiKey: string;
  // The global fetch in the app. Tests pass a fake that returns saved responses.
  fetch: typeof fetch;
}

// A Google call that failed: no answer in time, an error status, or a response that
// isn't what the app expects. The message is written for the agent.
export class GoogleRoutesError extends Error {
  override name = "GoogleRoutesError";
}

// Google found no way to drive the route, such as to a place no road reaches. Google
// answers {} with no error (Google design 2.3).
export class NoDrivingRouteError extends GoogleRoutesError {
  override name = "NoDrivingRouteError";
}

// Calls the Routes API's computeRoutes (Google design section 2). Every place goes by
// its Google place ID, never by name (Google design 2.4).
export class RoutesClient implements RouteFinder {
  readonly #options: RoutesClientOptions;

  constructor(options: RoutesClientOptions) {
    this.#options = options;
  }

  async route(path: RoutePath): Promise<FoundRoute> {
    const route = await this.#compute(
      requestFor(path.from, path.through, path.to),
      FIELD_MASK,
      path,
    );
    const stopCount = path.through.filter(
      (point) => !point.isPassThrough,
    ).length;
    return foundRouteOf(route, stopCount + 1);
  }

  async bestOrder(path: StopsPath): Promise<BestOrder> {
    const through = path.stops.map((place) => ({
      place,
      isPassThrough: false,
    }));
    const route = await this.#compute(
      {
        ...requestFor(path.from, through, path.to),
        optimizeWaypointOrder: true,
      },
      BEST_ORDER_FIELD_MASK,
      { from: path.from, through, to: path.to },
    );
    const order = route.optimizedIntermediateWaypointIndex ?? [];
    const isEachStopOnce =
      order.length === path.stops.length &&
      [...order].sort((one, other) => one - other).every((at, i) => at === i);
    if (!isEachStopOnce) {
      throw new GoogleRoutesError(
        "Google Routes gave a best order that doesn't hold each stop once.",
      );
    }
    return { order, route: foundRouteOf(route, path.stops.length + 1) };
  }

  async #compute(
    request: object,
    fieldMask: string,
    path: RoutePath,
  ): Promise<GoogleRoute> {
    const body = await this.#post(request, fieldMask);
    const parsed = routesResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GoogleRoutesError(
        `Google Routes sent a response the app doesn't understand: ${parsed.error.message}`,
      );
    }
    if (parsed.data === null) {
      throw new NoDrivingRouteError(noRouteMessage(path));
    }
    return parsed.data;
  }

  async #post(request: object, fieldMask: string): Promise<unknown> {
    let response: Response;
    let body: unknown;
    try {
      response = await this.#options.fetch(COMPUTE_ROUTES_URL, {
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
      throw new GoogleRoutesError(failedCallMessage(error), { cause: error });
    }
    if (!response.ok) {
      const detail = googleErrorBodySchema.safeParse(body);
      throw new GoogleRoutesError(
        `Google Routes refused the route with status ${String(response.status)}${detail.success ? `, ${detail.data}` : ""}.`,
      );
    }
    return body;
  }
}

// Google calls the points between the start and end "intermediates", and a
// pass-through point a "via" waypoint. Drive times don't follow traffic, since the
// trip is months away.
function requestFor(
  from: RoutablePlace,
  through: readonly RoutePoint[],
  to: RoutablePlace,
): object {
  return {
    origin: { placeId: from.googlePlaceId },
    destination: { placeId: to.googlePlaceId },
    intermediates: through.map((point) => ({
      placeId: point.place.googlePlaceId,
      via: point.isPassThrough,
    })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
  };
}

// Each segment's drive time, rounded to the nearest minute, and the distance, to a
// tenth of a mile.
function foundRouteOf(route: GoogleRoute, segmentCount: number): FoundRoute {
  if (route.legs.length !== segmentCount) {
    throw new GoogleRoutesError(
      `Google Routes gave ${String(route.legs.length)} segments for a route with ${String(segmentCount)}.`,
    );
  }
  return {
    segmentDriveTimesInMinutes: route.legs.map((segment) =>
      Math.round(segment.duration / SECONDS_PER_MINUTE),
    ),
    segmentDistancesInMiles: route.legs.map((segment) =>
      milesOf(segment.distanceMeters),
    ),
    distanceInMiles: milesOf(route.distanceMeters),
    routeLine: route.polyline.encodedPolyline,
  };
}

function milesOf(meters: number): number {
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}

// Google answers {} for a route through a pass-through point it can't pass, with no
// reason. In testing, Atlanta as a pass-through point on Seattle to Miami gave no route,
// and Atlanta as a stop gave one (checked 2026-10-24). So the error names the
// pass-through points, and says to try one as a stop.
function noRouteMessage(path: RoutePath): string {
  const named = (isPassThrough: boolean): string[] =>
    path.through
      .filter((point) => point.isPassThrough === isPassThrough)
      .map((point) => nameOf(point.place));
  const stops = named(false);
  const passing = named(true);
  const through = stops.length === 0 ? "" : ` through ${stops.join(", ")}`;
  const route = `Google found no driving route from ${nameOf(path.from)}${through} to ${nameOf(path.to)}`;
  return passing.length === 0
    ? `${route}.`
    : `${route}, passing ${passing.join(", ")}. Google sometimes can't pass a point without stopping, such as a big city, and doesn't say which. Try one as a stop instead.`;
}

function nameOf(place: RoutablePlace): string {
  return place.name ?? place.address;
}

function failedCallMessage(error: unknown): string {
  if (isTimeoutError(error)) {
    return `Google Routes didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds. Try again.`;
  }
  return "Google Routes couldn't be reached. Try again.";
}
