import type { Place } from "./place.js";
import {
  driveTimeOf,
  type FoundRoute,
  type RouteFinder,
} from "./route-finder.js";
import type { Stop } from "./stop.js";

// The stops a leg is routed through, with their places, in the day's order.
export interface StopsRoute {
  from: Place;
  to: Place;
  stops: readonly Stop[];
  stopPlaces: readonly Place[];
}

// The leg's own route, and whether it went through waypoints.
export interface LegRoute {
  found: FoundRoute;
  hasWaypoints: boolean;
}

export interface StopOrder {
  stopsInBestOrder: readonly Stop[];
  timeSavedInMinutes: number;
}

// Stops the check orders on their own, between two places that stay put.
interface OrderPart {
  from: Place;
  to: Place;
  stops: readonly Stop[];
  places: readonly Place[];
  // The leg's segment that leads to the part's first stop. The part's own order drives
  // this segment and the next `stops.length`.
  firstSegment: number;
}

// The stop-order check (technical spec section 8). A check-in splits the day into two
// parts, ordered on their own, since Google can't hold one stop in place while it
// reorders the rest. The check-in keeps its place between them. Each part is ordered
// only when it has two or more stops. Empty, and 0 saved, when none has.
export async function stopOrderOf(
  routeFinder: RouteFinder,
  route: StopsRoute,
  leg: LegRoute,
): Promise<StopOrder> {
  const parts = partsOf(route);
  if (parts.every((part) => part.stops.length < 2)) {
    return { stopsInBestOrder: [], timeSavedInMinutes: 0 };
  }
  const ordered = await Promise.all(
    parts.map((part) => orderPart(routeFinder, part, leg)),
  );
  const checkIn = route.stops.find((stop) => stop.kind === "checkIn");
  const [before, after] = ordered;
  return {
    stopsInBestOrder:
      checkIn === undefined || before === undefined || after === undefined
        ? (before?.stopsInBestOrder ?? [])
        : [...before.stopsInBestOrder, checkIn, ...after.stopsInBestOrder],
    timeSavedInMinutes: ordered.reduce(
      (total, part) => total + part.timeSavedInMinutes,
      0,
    ),
  };
}

// The whole day, or the stops before the check-in and the stops after it.
function partsOf(route: StopsRoute): OrderPart[] {
  const at = route.stops.findIndex((stop) => stop.kind === "checkIn");
  const checkInPlace = route.stopPlaces[at];
  if (at < 0 || checkInPlace === undefined) {
    return [
      {
        from: route.from,
        to: route.to,
        stops: route.stops,
        places: route.stopPlaces,
        firstSegment: 0,
      },
    ];
  }
  return [
    {
      from: route.from,
      to: checkInPlace,
      stops: route.stops.slice(0, at),
      places: route.stopPlaces.slice(0, at),
      firstSegment: 0,
    },
    {
      from: checkInPlace,
      to: route.to,
      stops: route.stops.slice(at + 1),
      places: route.stopPlaces.slice(at + 1),
      firstSegment: at + 1,
    },
  ];
}

// Google's best order leaves the waypoints out, since it refuses them. When its order
// differs from the day's, the part's own order is routed without waypoints too, so the
// two compare only the order. On a leg with no waypoints, that's the leg's own
// segments, so it needs no call.
async function orderPart(
  routeFinder: RouteFinder,
  part: OrderPart,
  leg: LegRoute,
): Promise<StopOrder> {
  if (part.stops.length < 2) {
    return { stopsInBestOrder: part.stops, timeSavedInMinutes: 0 };
  }
  const best = await routeFinder.bestOrder({
    from: part.from,
    stops: part.places,
    to: part.to,
  });
  const stopsInBestOrder = best.order.map((position) => {
    const stop = part.stops[position];
    if (stop === undefined) {
      throw new RangeError(`The best order has no stop ${String(position)}.`);
    }
    return stop;
  });
  if (best.order.every((position, index) => position === index)) {
    return { stopsInBestOrder, timeSavedInMinutes: 0 };
  }
  const ownMinutes = leg.hasWaypoints
    ? driveTimeOf(
        await routeFinder.route({
          from: part.from,
          through: part.places.map((place) => ({
            place,
            isPassThrough: false,
          })),
          to: part.to,
        }),
      )
    : leg.found.segmentDriveTimesInMinutes
        .slice(part.firstSegment, part.firstSegment + part.stops.length + 1)
        .reduce((total, minutes) => total + minutes, 0);
  return {
    stopsInBestOrder,
    timeSavedInMinutes: Math.max(0, ownMinutes - driveTimeOf(best.route)),
  };
}
