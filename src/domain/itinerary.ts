import type { CalendarDate } from "./calendar-date.js";
import type { CheckResult } from "./check-result.js";
import type { Day } from "./day.js";
import { keptValue, startingValue } from "./keeps-value.js";
import type { LastDay } from "./last-day.js";
import type { Place } from "./place.js";
import type { RejectedPlace } from "./rejected-place.js";
import { RuleError } from "./rule-error.js";
import type { Stay } from "./stay.js";
import { VIA_SERVICE } from "./via-service.js";

export interface ItineraryFields {
  id: string;
  startPlace: Place | null;
  endPlace: Place | null;
  startDate: CalendarDate | null;
  stays: readonly Stay[];
  lastDay: LastDay;
  rejectedPlaces: readonly RejectedPlace[];
  checkResults: readonly CheckResult[];
}

// The change methods only services reach (domain model section 1). Each runs the
// itinerary's own rules.
export interface ItineraryChanges {
  setStartPlace(startPlace: Place): void;
  setStartDate(startDate: CalendarDate): void;
  // Puts the stay after `after`, or first when it's null. A stay already in the
  // itinerary moves.
  placeStay(stay: Stay, after: Stay | null): void;
  removeStay(stay: Stay): void;
  // A place already rejected is skipped, and keeps its first reason.
  addRejectedPlace(rejectedPlace: RejectedPlace): void;
}

// The plan: where the trip starts and ends, when, its stays, and its days (domain
// model 3.4). It also holds the places the user rejected, and the check results from
// the last coordinator write.
export class Itinerary {
  readonly id: string;
  readonly lastDay: LastDay;
  #startPlace: Place | null;
  #endPlace: Place | null;
  #startDate: CalendarDate | null;
  #stays: Stay[];
  #rejectedPlaces: RejectedPlace[];
  #checkResults: CheckResult[];

  readonly [VIA_SERVICE]: ItineraryChanges = {
    setStartPlace: (startPlace) => {
      this.#startPlace = startPlace;
    },
    setStartDate: (startDate) => {
      this.#startDate = this.#checkedStartDate(startDate);
    },
    placeStay: (stay, after) => {
      this.#placeStay(stay, after);
    },
    removeStay: (stay) => {
      this.#refuseStayNotHeld(stay);
      this.#stays = this.#stays.filter((each) => each !== stay);
    },
    addRejectedPlace: (rejectedPlace) => {
      if (!this.isRejected(rejectedPlace.place)) {
        this.#rejectedPlaces.push(rejectedPlace);
      }
    },
  };

  constructor(fields: ItineraryFields) {
    this.id = fields.id;
    this.lastDay = fields.lastDay;
    this.#startPlace = fields.startPlace;
    this.#endPlace = fields.endPlace;
    this.#startDate = startingValue(fields.startDate, (startDate) =>
      this.#checkedStartDate(startDate),
    );
    if (new Set(fields.stays).size !== fields.stays.length) {
      throw new RuleError("An itinerary holds each stay once.");
    }
    this.#stays = [...fields.stays];
    this.#rejectedPlaces = [];
    fields.rejectedPlaces.forEach((rejectedPlace) => {
      this[VIA_SERVICE].addRejectedPlace(rejectedPlace);
    });
    this.#checkResults = checkedResults(fields.checkResults);
  }

  // Where the trip starts. Empty until the coordinator sets it, and never emptied.
  // ItineraryService.setStartPlace() sets it.
  get startPlace(): Place | null {
    return this.#startPlace;
  }

  // The same place as startPlace on a loop trip.
  get endPlace(): Place | null {
    return this.#endPlace;
  }

  set endPlace(value: Place | null) {
    this.#endPlace = keptValue(value, "The itinerary's endPlace");
  }

  // The first day's date. ItineraryService.setStartDate() sets it.
  get startDate(): CalendarDate | null {
    return this.#startDate;
  }

  // In order: the shape of the trip.
  get stays(): readonly Stay[] {
    return Object.freeze([...this.#stays]);
  }

  // In the order rejected.
  get rejectedPlaces(): readonly RejectedPlace[] {
    return Object.freeze([...this.#rejectedPlaces]);
  }

  // The check results after the last coordinator write. In no order.
  get checkResults(): readonly CheckResult[] {
    return Object.freeze([...this.#checkResults]);
  }

  // Each stay's days, in the stays' order, then the last day.
  get days(): readonly Day[] {
    return Object.freeze([
      ...this.#stays.flatMap((stay) => stay.days),
      this.lastDay,
    ]);
  }

  // How many days the trip has, counting the last day. At least 1.
  get dayCount(): number {
    return this.days.length;
  }

  get endDate(): CalendarDate | null {
    return this.#startDate?.plusDays(this.dayCount - 1) ?? null;
  }

  // Without the drive buffer. A day with no leg adds nothing.
  get totalDriveTimeInMinutes(): number {
    return this.days.reduce(
      (total, day) => total + (day.leg?.driveTimeInMinutes ?? 0),
      0,
    );
  }

  isRejected(place: Place): boolean {
    return this.#rejectedPlaces.some(
      (rejected) => rejected.place.id === place.id,
    );
  }

  // The FeasibilityChecker's full list of current check results, which can be empty.
  replaceCheckResults(checkResults: readonly CheckResult[]): void {
    this.#checkResults = checkedResults(checkResults);
  }

  // Today's date comes from the start place's time zone, so a start date needs one.
  #checkedStartDate(startDate: CalendarDate): CalendarDate {
    if (this.#startPlace === null) {
      throw new RuleError(
        "The itinerary needs a start place before a start date, since today's date comes from the start place's time zone.",
      );
    }
    return startDate;
  }

  #placeStay(stay: Stay, after: Stay | null): void {
    if (after === stay) {
      throw new RuleError("A stay can't be placed after itself.");
    }
    if (after !== null) {
      this.#refuseStayNotHeld(after);
    }
    const kept = this.#stays.filter((each) => each !== stay);
    const at = after === null ? 0 : kept.indexOf(after) + 1;
    this.#stays = [...kept.slice(0, at), stay, ...kept.slice(at)];
  }

  #refuseStayNotHeld(stay: Stay): void {
    if (!this.#stays.includes(stay)) {
      throw new RuleError(`The itinerary has no stay ${stay.id}.`);
    }
  }
}

// At most one check result per check and subject (domain model 3.3).
function checkedResults(checkResults: readonly CheckResult[]): CheckResult[] {
  checkResults.forEach((result, index) => {
    if (checkResults.slice(0, index).some((each) => each.isSameAs(result))) {
      throw new RuleError(
        `There can be only one ${result.check} check result for ${result.subjectId}.`,
      );
    }
  });
  return [...checkResults];
}
