import type {
  BestOrder,
  FoundRoute,
  RouteFinder,
  RoutePath,
  StopsPath,
} from "./route-finder.js";

// A route finder for tests, in place of Google Routes (DEVELOPMENT.md section 5). It
// records each call. By default each segment takes 30 minutes, and the best order is
// the order given. A test sets `driveTimesFor` or `bestOrderFor` to answer otherwise,
// or `failure` to make every call fail.
export class FakeRouteFinder implements RouteFinder {
  readonly routes: RoutePath[] = [];
  readonly bestOrders: StopsPath[] = [];
  failure: Error | null = null;
  driveTimesFor: (path: RoutePath) => readonly number[] | null = () => null;
  bestOrderFor: (
    path: StopsPath,
  ) => { order: readonly number[]; driveTimes: readonly number[] } | null =
    () => null;

  route(path: RoutePath): Promise<FoundRoute> {
    this.routes.push(path);
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    const stopCount = path.through.filter(
      (point) => !point.isPassThrough,
    ).length;
    return Promise.resolve(
      foundRoute(
        this.driveTimesFor(path) ?? Array<number>(stopCount + 1).fill(30),
      ),
    );
  }

  bestOrder(path: StopsPath): Promise<BestOrder> {
    this.bestOrders.push(path);
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    const answer = this.bestOrderFor(path) ?? {
      order: path.stops.map((stop, index) => index),
      driveTimes: Array<number>(path.stops.length + 1).fill(30),
    };
    return Promise.resolve({
      order: answer.order,
      route: foundRoute(answer.driveTimes),
    });
  }

  get callCount(): number {
    return this.routes.length + this.bestOrders.length;
  }
}

function foundRoute(segmentDriveTimesInMinutes: readonly number[]): FoundRoute {
  return {
    segmentDriveTimesInMinutes,
    distanceInMiles: segmentDriveTimesInMinutes.length * 25,
    routeLine: "_p~iF~ps|U_ulLnnqC",
  };
}
