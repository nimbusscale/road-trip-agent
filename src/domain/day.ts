import {
  checkedApprovals,
  type DayApproval,
  withApproval,
  withoutApproval,
} from "./approval.js";
import type { ApprovalKind } from "./approval-kind.js";
import type { Leg } from "./leg.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import type { Stop } from "./stop.js";
import type { TimeOfDay } from "./time-of-day.js";
import { VIA_SERVICE } from "./via-service.js";

export interface DayFields {
  id: string;
  ownStartTime: TimeOfDay | null;
  approvals: readonly DayApproval[];
}

// The change methods only services reach (domain model section 1). Each runs the day's
// own rules.
export interface DayChanges {
  // Puts the stops on the day in list order, after `after`, or first when it's null.
  // A stop already on the day moves.
  placeStops(stops: readonly Stop[], after: Stop | null): void;
  removeStops(stops: readonly Stop[]): void;
  // Null removes the leg, and the waypoints go with it.
  setLeg(leg: Leg | null): void;
  setApproval(approval: DayApproval): void;
  removeApproval(kind: ApprovalKind): void;
}

// One day of the trip (domain model 3.6). A StayDay ends with a night at a stay, and
// the LastDay ends at the end place. `kind` tells them apart. A day doesn't know which
// stay holds it, or the day before it: the calendar works those out.
//
// A day is created with no stops, leg, or waypoints. Services add them, and so does the
// load, with itineraryFromStored().
export abstract class Day {
  abstract readonly kind: "stayDay" | "lastDay";
  readonly id: string;
  // A start time the user agreed to for this day. Null means the trip brief's
  // usualStartTime. A TimeOfDay is always a valid time, so it has no rules to run.
  ownStartTime: TimeOfDay | null;
  #stops: Stop[] = [];
  #waypoints: Place[] = [];
  #leg: Leg | null = null;
  #approvals: DayApproval[];

  readonly [VIA_SERVICE]: DayChanges = this.dayChanges();

  constructor(fields: DayFields) {
    this.id = fields.id;
    this.ownStartTime = fields.ownStartTime;
    this.#approvals = checkedApprovals(fields.approvals);
  }

  // In the order the coordinator set. Code never reorders them.
  get stops(): readonly Stop[] {
    return Object.freeze([...this.#stops]);
  }

  get waypoints(): readonly Place[] {
    return Object.freeze([...this.#waypoints]);
  }

  get leg(): Leg | null {
    return this.#leg;
  }

  get approvals(): readonly DayApproval[] {
    return Object.freeze([...this.#approvals]);
  }

  // Replaces the waypoints, in the order given. An empty list clears them. A day has
  // waypoints only while it has a leg.
  setWaypoints(waypoints: readonly Place[]): void {
    if (this.#leg === null) {
      throw new RuleError(
        "A day with no leg can't have waypoints, such as a rest day, or a day that stays put with no selected stop yet.",
      );
    }
    this.#waypoints = [...waypoints];
  }

  protected dayChanges(): DayChanges {
    return {
      placeStops: (stops, after) => {
        this.#placeStops(stops, after);
      },
      removeStops: (stops) => {
        this.#refuseStopsNotOnDay(stops);
        this.#stops = this.#stops.filter((stop) => !stops.includes(stop));
      },
      setLeg: (leg) => {
        this.#leg = leg;
        if (leg === null) {
          this.#waypoints = [];
        }
      },
      setApproval: (approval) => {
        this.#approvals = withApproval(this.#approvals, approval);
      },
      removeApproval: (kind) => {
        if (kind === "openingHours") {
          throw new RuleError(
            "A day holds no opening hours approval. Only stops hold them.",
          );
        }
        this.#approvals = withoutApproval(this.#approvals, kind);
      },
    };
  }

  #placeStops(stops: readonly Stop[], after: Stop | null): void {
    if (new Set(stops).size !== stops.length) {
      throw new RuleError("A day holds each stop once.");
    }
    if (
      after !== null &&
      (stops.includes(after) || !this.#stops.includes(after))
    ) {
      throw new RuleError(
        `The stop to place them after has to be on the day, and not one being placed. ${describeStop(after)} isn't.`,
      );
    }
    const kept = this.#stops.filter((stop) => !stops.includes(stop));
    const at = after === null ? 0 : kept.indexOf(after) + 1;
    this.#stops = [...kept.slice(0, at), ...stops, ...kept.slice(at)];
  }

  #refuseStopsNotOnDay(stops: readonly Stop[]): void {
    const missing = stops.filter((stop) => !this.#stops.includes(stop));
    if (missing.length > 0) {
      throw new RuleError(
        `These stops aren't on the day: ${missing.map(describeStop).join("; ")}.`,
      );
    }
  }
}

// A stop has no name of its own, so an error names it by its purpose and ID.
export function describeStop(stop: Stop): string {
  return `${stop.purpose} (${stop.id})`;
}
