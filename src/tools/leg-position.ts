import { decodeRouteLine, type LinePoint } from "../google/route-line.js";
import { type MapPoint, milesBetween } from "./search-result-lines.js";

// Where a place is along the leg, and how far off it.
export interface PlaceOnLine {
  // The share of the line before the line's point nearest the place, from 0 at the
  // start to 1 at the end.
  share: number;
  // From the place to that point, as the crow flies.
  milesOff: number;
}

// Where places are on a leg's route line. Google's drives to and from a place don't
// follow the leg's waypoints or stops, so they can't put places in route order, or say
// how far off the route a place is (Google design 2.4). The line can: it's the leg's own
// route.
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
    let nearest = 0;
    let nearestMiles = Infinity;
    this.#points.forEach((point, index) => {
      const miles = milesBetween(point, place);
      if (miles < nearestMiles) {
        nearest = index;
        nearestMiles = miles;
      }
    });
    const total = this.#milesTo.at(-1) ?? 0;
    return {
      share: total === 0 ? 0 : (this.#milesTo[nearest] ?? 0) / total,
      // A line with no points can't happen: Google gives even a route of 0 miles one.
      milesOff: Number.isFinite(nearestMiles) ? nearestMiles : 0,
    };
  }
}
