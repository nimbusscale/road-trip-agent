import type { Place } from "./place.js";
import type { Stop } from "./stop.js";

export interface LegFields {
  segmentDriveTimesInMinutes: readonly number[];
  distanceInMiles: number;
  routeLine: string;
  stopsInBestOrder: readonly Stop[];
  timeSavedInMinutes: number;
  routedFromPlace: Place;
  routedToPlace: Place;
  routedStopPlaces: readonly Place[];
  routedWaypoints: readonly Place[];
}

// The drive on one day: the route Google Routes gave for it (domain model 3.8). It's
// stored data only here. Phase 19's LegsService routes it. A leg never changes: a
// re-route replaces it whole. Google calls a segment a "leg", and our leg a "route".
export class Leg {
  // Each segment's drive time, in route order, without the drive buffer.
  readonly segmentDriveTimesInMinutes: readonly number[];
  readonly distanceInMiles: number;
  // Google's encoded route line. It's large, so it never goes to an agent.
  readonly routeLine: string;
  readonly stopsInBestOrder: readonly Stop[];
  readonly timeSavedInMinutes: number;
  // What the leg was routed for, so LegsService can tell when to route it again.
  readonly routedFromPlace: Place;
  readonly routedToPlace: Place;
  readonly routedStopPlaces: readonly Place[];
  readonly routedWaypoints: readonly Place[];

  constructor(fields: LegFields) {
    this.segmentDriveTimesInMinutes = Object.freeze([
      ...fields.segmentDriveTimesInMinutes,
    ]);
    this.distanceInMiles = fields.distanceInMiles;
    this.routeLine = fields.routeLine;
    this.stopsInBestOrder = Object.freeze([...fields.stopsInBestOrder]);
    this.timeSavedInMinutes = fields.timeSavedInMinutes;
    this.routedFromPlace = fields.routedFromPlace;
    this.routedToPlace = fields.routedToPlace;
    this.routedStopPlaces = Object.freeze([...fields.routedStopPlaces]);
    this.routedWaypoints = Object.freeze([...fields.routedWaypoints]);
  }

  // Without the drive buffer.
  get driveTimeInMinutes(): number {
    return this.segmentDriveTimesInMinutes.reduce(
      (total, minutes) => total + minutes,
      0,
    );
  }
}
