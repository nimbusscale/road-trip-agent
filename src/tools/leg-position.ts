import { decodeRouteLine, type LinePoint } from "../google/route-line.js";
import { type MapPoint, milesBetween } from "./search-result-lines.js";

// Where a place is along the leg, and how far off it.
export interface PlaceOnLine {
  // The share of the line before the line's spot nearest the place, from 0 at the start
  // to 1 at the end.
  share: number;
  // From the place to that spot, as the crow flies.
  milesOff: number;
}

// The spot on one stretch of the line nearest a place.
interface NearestSpot {
  milesAlong: number;
  milesOff: number;
}

// Where places are on a leg's route line. Google's drives to and from a place don't
// follow the leg's waypoints or stops, so they can't put places in route order, or say
// how far off the route a place is (Google design 2.4). The line can: it's the leg's own
// route.
//
// The nearest spot can fall between two of the line's points. On a straight highway,
// Google's points can be over 5 miles apart, such as on I-80 from Salt Lake City to
// Wendover, so a place on the road between them would be miles from either point.
export class LegPosition {
  readonly #points: readonly LinePoint[];
  // The miles along the line to each point.
  readonly #milesTo: readonly number[];

  constructor(routeLine: string) {
    this.#points = decodeRouteLine(routeLine);
    const milesTo: number[] = [];
    let total = 0;
    this.#points.forEach((point, index) => {
      const previous = this.#points[index - 1];
      total += previous === undefined ? 0 : milesBetween(previous, point);
      milesTo.push(total);
    });
    this.#milesTo = milesTo;
  }

  of(place: MapPoint): PlaceOnLine {
    // A line of one point has no stretches: Google gives one for a route of 0 miles.
    const first = this.#points[0];
    let nearest: NearestSpot = {
      milesAlong: 0,
      // A line with no points can't happen.
      milesOff: first === undefined ? 0 : milesBetween(first, place),
    };
    this.#points.slice(1).forEach((end, index) => {
      const start = this.#points[index] ?? end;
      const spot = spotOn(start, end, place);
      if (spot.milesOff < nearest.milesOff) {
        nearest = {
          milesAlong: (this.#milesTo[index] ?? 0) + spot.share * spot.miles,
          milesOff: spot.milesOff,
        };
      }
    });
    const total = this.#milesTo.at(-1) ?? 0;
    return {
      share: total === 0 ? 0 : nearest.milesAlong / total,
      milesOff: nearest.milesOff,
    };
  }
}

// The spot on the stretch from start to end nearest the place, as the share of the
// stretch before it. The stretch is short enough to treat as flat, with longitude scaled
// down by the latitude.
function spotOn(
  start: LinePoint,
  end: LinePoint,
  place: MapPoint,
): { share: number; miles: number; milesOff: number } {
  const scale = Math.cos((start.latitude * Math.PI) / 180);
  const east = (end.longitude - start.longitude) * scale;
  const north = end.latitude - start.latitude;
  const placeEast = (place.longitude - start.longitude) * scale;
  const placeNorth = place.latitude - start.latitude;
  const lengthSquared = east ** 2 + north ** 2;
  const share =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, (placeEast * east + placeNorth * north) / lengthSquared),
        );
  const spot = {
    latitude: start.latitude + share * (end.latitude - start.latitude),
    longitude: start.longitude + share * (end.longitude - start.longitude),
  };
  return {
    share,
    miles: milesBetween(start, end),
    milesOff: milesBetween(spot, place),
  };
}
