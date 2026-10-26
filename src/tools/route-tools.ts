import { durationText, placeText } from "../domain/check-text.js";
import { RuleError } from "../domain/rule-error.js";
import {
  driveTimeOf,
  type FoundRoute,
  type RoutablePlace,
} from "../domain/route-finder.js";
import type { NameMatch } from "../google/places-text-search.schema.js";
import { ID_PREFIXES } from "../ids/new-id.js";
import { refuseWrongKind } from "./id-kind.js";
import {
  COMPUTE_ROUTE_INPUT,
  type RouteInputPoint,
} from "./route-input.schema.js";
import type { RoutingSession } from "./routing-session.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";

// The coordinator's rough routing tool (tool design 2.4). It saves nothing.

export const COMPUTE_ROUTE_DESCRIPTION =
  'Works out a rough route through points in order, for planning, such as a sketch of the trip. One call can cover the whole trip. Each point is a stopover, such as a town that might become a stay, or a waypoint. The road time is split at each stopover, not at a waypoint. "fastest" puts the stopovers between the first and the last in the fastest order, and can\'t take waypoints. To get both, call with "fastest", then with "keep" and the waypoints added. A plain name can match the wrong place, so the reply gives what each one matched. Returns the road time and distance between each stopover and the next, and in all. It saves nothing to the trip.';

// A point once its place is known. A plain name keeps what it matched, for the reply.
interface FoundPoint {
  readonly place: RoutablePlace;
  readonly isPassThrough: boolean;
  // The place's name, or the plain name as given.
  readonly label: string;
  readonly plainName: { text: string; match: NameMatch } | null;
}

export function computeRouteTool(
  session: RoutingSession,
): StrictToolDefinition {
  return {
    ...strictTool(
      "compute_route",
      COMPUTE_ROUTE_DESCRIPTION,
      COMPUTE_ROUTE_INPUT,
      ({ points, order }) =>
        readReplyOrReadableError(async () => {
          refuseBadPoints(points, order === "fastest");
          const found = await Promise.all(
            points.map((point) => foundPoint(session, point)),
          );
          const lines =
            order === "fastest"
              ? await fastestLines(session, found)
              : await keptLines(session, found);
          return textReply([
            ...lines,
            `Road times are Google's averages, without the drive buffer. The schedule and the daily driving check add ${String(session.settings.driveBufferPercent)}% to each drive.`,
            ...matchLines(found),
          ]);
        }),
    ),
    annotations: { readOnlyHint: true },
  };
}

// Google can't pick an order and steer through waypoints in one call (Google
// design 2.1).
function refuseBadPoints(
  points: readonly RouteInputPoint[],
  isFastest: boolean,
): void {
  if (points[0]?.kind !== "stopover" || points.at(-1)?.kind !== "stopover") {
    throw new RuleError(
      "The first and the last points are stopovers, not waypoints.",
    );
  }
  if (isFastest && points.some((point) => point.kind === "waypoint")) {
    throw new RuleError(
      'Google can\'t put stopovers in the fastest order and steer through waypoints in one call. Call with "fastest" and no waypoints, then with "keep" and the waypoints added.',
    );
  }
}

// A place ID is one of this trip's places. Anything else is a plain name, which Google
// matches to a place without saving it (tool design 2.4).
async function foundPoint(
  session: RoutingSession,
  point: RouteInputPoint,
): Promise<FoundPoint> {
  const isPassThrough = point.kind === "waypoint";
  if (point.place.startsWith(ID_PREFIXES.place)) {
    const place = await session.places.get(session.tripId, point.place);
    return { place, isPassThrough, label: placeText(place), plainName: null };
  }
  refuseWrongKind(point.place, "place");
  const match = await session.google.matchName(point.place);
  if (match === null) {
    throw new RuleError(
      `Google found no place for "${point.place}". Give it with its state, or look it up with find_place.`,
    );
  }
  return {
    place: match,
    isPassThrough,
    label: point.place,
    plainName: { text: point.place, match },
  };
}

async function keptLines(
  session: RoutingSession,
  points: readonly FoundPoint[],
): Promise<string[]> {
  const route = await session.routeFinder.route({
    from: ends(points).first.place,
    through: points.slice(1, -1),
    to: ends(points).last.place,
  });
  return ["Route, in the order given:", ...segmentLines(points, route)];
}

async function fastestLines(
  session: RoutingSession,
  points: readonly FoundPoint[],
): Promise<string[]> {
  const { first, last } = ends(points);
  const middle = points.slice(1, -1);
  const best = await session.routeFinder.bestOrder({
    from: first.place,
    stops: middle.map((point) => point.place),
    to: last.place,
  });
  const ordered = [
    first,
    ...best.order
      .map((at) => middle[at])
      .filter((point) => point !== undefined),
    last,
  ];
  const isSame = best.order.every((at, index) => at === index);
  return [
    `Route, in the fastest order. ${isSame ? "It's the order given." : "Google changed the order of the stopovers between the first and the last."}`,
    ...segmentLines(ordered, best.route),
  ];
}

// One line for each stopover to the next, naming the waypoints between them.
function segmentLines(
  points: readonly FoundPoint[],
  route: FoundRoute,
): string[] {
  const stops = points.filter((point) => !point.isPassThrough);
  const lines = stops.slice(1).map((stop, index) => {
    const from = stops[index];
    const between = points.slice(
      points.indexOf(from ?? stop) + 1,
      points.indexOf(stop),
    );
    const through =
      between.length === 0
        ? ""
        : `, through ${between.map((point) => point.label).join(", ")}`;
    const minutes = route.segmentDriveTimesInMinutes[index] ?? 0;
    const miles = route.segmentDistancesInMiles[index] ?? 0;
    return `- ${from?.label ?? ""} → ${stop.label}${through}: ${durationText(minutes)}, ${String(miles)} miles.`;
  });
  return [
    ...lines,
    `In all: ${durationText(driveTimeOf(route))}, ${String(route.distanceInMiles)} miles.`,
  ];
}

// Such as '- "Dewey Bridge, UT" matched Dewey Bridge, at UT-128, Moab, UT 84532, USA.'
function matchLines(points: readonly FoundPoint[]): string[] {
  const matched = points.flatMap((point) =>
    point.plainName === null ? [] : [point.plainName],
  );
  if (matched.length === 0) {
    return [];
  }
  return [
    "What each plain name matched:",
    ...matched.map(
      ({ text, match }) =>
        `- "${text}" matched ${match.name ?? "a place with no name"}, at ${match.address}.`,
    ),
  ];
}

function ends(points: readonly FoundPoint[]): {
  first: FoundPoint;
  last: FoundPoint;
} {
  const first = points[0];
  const last = points.at(-1);
  // The input has at least two points.
  if (first === undefined || last === undefined) {
    throw new TypeError("A route has at least two points.");
  }
  return { first, last };
}
