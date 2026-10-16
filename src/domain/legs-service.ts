import type { Calendar } from "./calendar.js";
import { describeStop, type Day } from "./day.js";
import type { Itinerary } from "./itinerary.js";
import { Leg } from "./leg.js";
import type { Place } from "./place.js";
import {
  driveTimeOf,
  type FoundRoute,
  type RouteFinder,
} from "./route-finder.js";
import { RuleError } from "./rule-error.js";
import { StayDay } from "./stay-day.js";
import type { Stop } from "./stop.js";
import { VIA_SERVICE } from "./via-service.js";
import { withWaypoints } from "./waypoint-placement.js";

// One day whose leg updateLegs() added, re-routed, or removed (domain model 4.7). The
// old leg is null for an added leg, and the new leg for a removed one. It isn't stored.
export interface LegChange {
  readonly day: Day;
  readonly oldLeg: Leg | null;
  readonly newLeg: Leg | null;
}

export interface LegsServiceGiven {
  calendar: Calendar;
  routeFinder: RouteFinder;
}

// What a day's leg is routed for now: where it starts and ends, its selected stops in
// the day's order, and its waypoints.
interface DayRoute {
  from: Place;
  to: Place;
  stops: readonly Stop[];
  stopPlaces: readonly Place[];
  waypoints: readonly Place[];
}

interface DetourRoute {
  from: Place;
  to: Place;
  waypoints: readonly Place[];
  before: readonly Place[];
  after: readonly Place[];
}

interface StopOrder {
  stopsInBestOrder: readonly Stop[];
  timeSavedInMinutes: number;
}

// Decides which days have a leg, and routes them (domain model 4.7). It's the one place
// that calls Google Routes for the itinerary. Created for one trip.
export class LegsService {
  readonly #given: LegsServiceGiven;

  constructor(given: LegsServiceGiven) {
    this.#given = given;
  }

  // The finish of every write. Adds, re-routes, or removes each day's leg, and leaves
  // the rest alone. When a call to Google fails, it refuses before changing any leg.
  async updateLegs(itinerary: Itinerary): Promise<LegChange[]> {
    const changes = await Promise.all(
      itinerary.days.map((day) =>
        this.#legChangeFor(day, this.#routeFor(itinerary, day)),
      ),
    );
    const made = changes.filter((change) => change !== null);
    made.forEach((change) => {
      change.day[VIA_SERVICE].setLeg(change.newLeg);
    });
    return made;
  }

  // Each place's detour time for a stop along the leg, in the order given: the drive
  // time of the leg with the place at the stop's position, minus the leg's, and never
  // less than 0. One call to Google Routes per place. Changes nothing.
  async detourTimesOf(
    itinerary: Itinerary,
    stop: Stop,
    places: readonly Place[],
  ): Promise<number[]> {
    const { day, route } = this.#detourRouteFor(itinerary, stop);
    const legMinutes = day.leg?.driveTimeInMinutes ?? 0;
    return Promise.all(
      places.map(async (place) => {
        const stopPlaces = [...route.before, place, ...route.after];
        const found = await this.#given.routeFinder.route({
          from: route.from,
          through: withWaypoints(
            route.from,
            stopPlaces,
            route.to,
            route.waypoints,
          ),
          to: route.to,
        });
        return Math.max(0, driveTimeOf(found) - legMinutes);
      }),
    );
  }

  // The day's route, split at the stop: the selected places before it and after it, in
  // the day's order. The stop's own selected place, if it has one, gives way to each
  // place measured.
  #detourRouteFor(
    itinerary: Itinerary,
    stop: Stop,
  ): { day: Day; route: DetourRoute } {
    if (stop.searchArea !== "alongLeg") {
      throw new RuleError(
        `Only a stop along the leg has detour times. ${describeStop(stop)} isn't along the leg.`,
      );
    }
    const day = this.#given.calendar.dayOf(itinerary, stop);
    const route = this.#routeFor(itinerary, day);
    if (day.leg === null || route === null) {
      throw new RuleError(
        `The day of ${describeStop(stop)} has no leg yet, so there's no route to measure a detour from.`,
      );
    }
    const position = day.stops.indexOf(stop);
    const selectedPlaces = (stops: readonly Stop[]): Place[] =>
      stops.flatMap((each) => each.selectedPlace ?? []);
    return {
      day,
      route: {
        from: route.from,
        to: route.to,
        waypoints: route.waypoints,
        before: selectedPlaces(day.stops.slice(0, position)),
        after: selectedPlaces(day.stops.slice(position + 1)),
      },
    };
  }

  // What the day's leg should be routed for now, or null when it shouldn't have one: a
  // rest day, a day whose ends aren't known yet, or a day that stays put with no
  // selected stop (domain model 4.7, "Which days have a leg").
  #routeFor(itinerary: Itinerary, day: Day): DayRoute | null {
    const { calendar } = this.#given;
    const from = calendar.fromPlaceOf(itinerary, day);
    const to = calendar.toPlaceOf(itinerary, day);
    const stops = day.stops.filter((stop) => stop.selectedPlace !== null);
    if (
      (day instanceof StayDay && day.isRestDay) ||
      from === null ||
      to === null ||
      (calendar.isStayingPut(itinerary, day) && stops.length === 0)
    ) {
      return null;
    }
    return {
      from,
      to,
      stops,
      stopPlaces: stops.flatMap((stop) => stop.selectedPlace ?? []),
      waypoints: day.waypoints,
    };
  }

  async #legChangeFor(
    day: Day,
    route: DayRoute | null,
  ): Promise<LegChange | null> {
    const oldLeg = day.leg;
    if (route === null) {
      return oldLeg === null ? null : { day, oldLeg, newLeg: null };
    }
    if (oldLeg !== null && isRoutedFor(oldLeg, route)) {
      return null;
    }
    return { day, oldLeg, newLeg: await this.#routeLeg(route) };
  }

  // One call through the day's start, its selected stops, and its end, with the
  // waypoints among them. Then the stop-order check, with two or more stops.
  async #routeLeg(route: DayRoute): Promise<Leg> {
    const through = withWaypoints(
      route.from,
      route.stopPlaces,
      route.to,
      route.waypoints,
    );
    const found = await this.#given.routeFinder.route({
      from: route.from,
      through,
      to: route.to,
    });
    const hasWaypoints = through.some((point) => point.isPassThrough);
    const stopOrder = await this.#stopOrderOf(route, found, hasWaypoints);
    return new Leg({
      ...found,
      ...stopOrder,
      routedFromPlace: route.from,
      routedToPlace: route.to,
      routedStopPlaces: route.stopPlaces,
      routedWaypoints: route.waypoints,
    });
  }

  // The stop-order check (technical spec section 8). Google's best order leaves the
  // waypoints out, since it refuses them. When its order differs from the day's, the
  // day's own order is routed without waypoints too, so the two compare only the order.
  // On a leg with no waypoints, that's the leg's own route, so it needs no call.
  async #stopOrderOf(
    route: DayRoute,
    legRoute: FoundRoute,
    hasWaypoints: boolean,
  ): Promise<StopOrder> {
    if (route.stops.length < 2) {
      return { stopsInBestOrder: [], timeSavedInMinutes: 0 };
    }
    const { routeFinder } = this.#given;
    const best = await routeFinder.bestOrder({
      from: route.from,
      stops: route.stopPlaces,
      to: route.to,
    });
    const stopsInBestOrder = best.order.map((position) => {
      const stop = route.stops[position];
      if (stop === undefined) {
        throw new RangeError(`The best order has no stop ${String(position)}.`);
      }
      return stop;
    });
    if (best.order.every((position, index) => position === index)) {
      return { stopsInBestOrder, timeSavedInMinutes: 0 };
    }
    const ownOrder = hasWaypoints
      ? await routeFinder.route({
          from: route.from,
          through: route.stopPlaces.map((place) => ({
            place,
            isPassThrough: false,
          })),
          to: route.to,
        })
      : legRoute;
    return {
      stopsInBestOrder,
      timeSavedInMinutes: Math.max(
        0,
        driveTimeOf(ownOrder) - driveTimeOf(best.route),
      ),
    };
  }
}

// Whether the leg was routed for what the day is now (domain model 3.8, "A leg
// remembers what it was routed for"). Places are compared by ID.
function isRoutedFor(leg: Leg, route: DayRoute): boolean {
  return (
    leg.routedFromPlace.id === route.from.id &&
    leg.routedToPlace.id === route.to.id &&
    isSamePlaces(leg.routedStopPlaces, route.stopPlaces) &&
    isSamePlaces(leg.routedWaypoints, route.waypoints)
  );
}

function isSamePlaces(
  these: readonly Place[],
  those: readonly Place[],
): boolean {
  return (
    these.length === those.length &&
    these.every((place, index) => place.id === those[index]?.id)
  );
}
