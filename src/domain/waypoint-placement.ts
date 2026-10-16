import type { Place } from "./place.js";
import type { RoutePoint } from "./route-finder.js";

const EARTH_RADIUS_IN_MILES = 3958.8;

// Puts the waypoints among the stops, between the start and end (domain model 4.7, "How
// a leg is routed"). Each goes in the gap where it adds the least straight-line
// distance, one at a time, in the coordinator's order, so a waypoint placed earlier is a
// neighbor for the next. A waypoint that's the same place as the start or end is
// skipped, since it would add nothing. Needs no call to Google. Returns the points
// between the start and end, in route order.
export function withWaypoints(
  from: Place,
  stops: readonly Place[],
  to: Place,
  waypoints: readonly Place[],
): RoutePoint[] {
  const points: RoutePoint[] = [
    { place: from, isPassThrough: false },
    ...stops.map((place) => ({ place, isPassThrough: false })),
    { place: to, isPassThrough: false },
  ];
  waypoints
    .filter((waypoint) => waypoint.id !== from.id && waypoint.id !== to.id)
    .forEach((waypoint) => {
      points.splice(cheapestGap(points, waypoint), 0, {
        place: waypoint,
        isPassThrough: true,
      });
    });
  return points.slice(1, -1);
}

// Where to insert the waypoint: the position after the gap's first neighbor. A tie goes
// to the earlier gap.
function cheapestGap(points: readonly RoutePoint[], waypoint: Place): number {
  let best = 1;
  let bestAdded = Infinity;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1]?.place;
    const after = points[index]?.place;
    if (before === undefined || after === undefined) {
      continue;
    }
    const added =
      milesBetween(before, waypoint) +
      milesBetween(waypoint, after) -
      milesBetween(before, after);
    if (added < bestAdded) {
      best = index;
      bestAdded = added;
    }
  }
  return best;
}

// The great-circle distance, from the coordinates stored on each place.
export function milesBetween(one: Place, other: Place): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const latitudeChange = toRadians(other.latitude - one.latitude);
  const longitudeChange = toRadians(other.longitude - one.longitude);
  const halfChord =
    Math.sin(latitudeChange / 2) ** 2 +
    Math.cos(toRadians(one.latitude)) *
      Math.cos(toRadians(other.latitude)) *
      Math.sin(longitudeChange / 2) ** 2;
  return 2 * EARTH_RADIUS_IN_MILES * Math.asin(Math.sqrt(halfChord));
}
