import type { Place } from "./place.js";

// One place a route goes through between its start and end. A pass-through point is a
// waypoint: the route passes it without stopping, so it doesn't split a segment.
export interface RoutePoint {
  place: Place;
  isPassThrough: boolean;
}

// A route from one place to another, through the points in order.
export interface RoutePath {
  from: Place;
  through: readonly RoutePoint[];
  to: Place;
}

// Stops to put in the fastest order between two places, with no pass-through points,
// since Google refuses them when it picks an order (Google design 2.1).
export interface StopsPath {
  from: Place;
  stops: readonly Place[];
  to: Place;
}

// What Google Routes gave for a route.
export interface FoundRoute {
  // One for each segment, from the start, through each point that isn't a pass-through
  // point, to the end. Without the drive buffer.
  segmentDriveTimesInMinutes: readonly number[];
  distanceInMiles: number;
  // Google's encoded route line.
  routeLine: string;
}

export interface BestOrder {
  // The stops' positions in the list given, in the fastest order.
  order: readonly number[];
  // The route through the stops in that order.
  route: FoundRoute;
}

// The code that calls Google Routes (domain model 4.7). It's outside the domain model,
// so LegsService is given one: the Routes client in the app, and a fake in tests. Each
// call refuses when Google finds no driving route, or the call fails.
export interface RouteFinder {
  route(path: RoutePath): Promise<FoundRoute>;
  bestOrder(path: StopsPath): Promise<BestOrder>;
}

export function driveTimeOf(route: FoundRoute): number {
  return route.segmentDriveTimesInMinutes.reduce(
    (total, minutes) => total + minutes,
    0,
  );
}
