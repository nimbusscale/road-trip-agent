import type { Settings } from "../config/settings.schema.js";
import { OpeningHoursApproval } from "./approval.js";
import type { ApprovalKind } from "./approval-kind.js";
import type { Calendar } from "./calendar.js";
import type { CandidateOffer } from "./candidate.js";
import { type Day, describeStop } from "./day.js";
import type { Itinerary } from "./itinerary.js";
import type { Place } from "./place.js";
import { refuseRejectedPlaces } from "./refuse-rejected.js";
import { RuleError } from "./rule-error.js";
import type { ScheduleTime } from "./schedule-time.js";
import type { Stay } from "./stay.js";
import { StayDay } from "./stay-day.js";
import type { Stop } from "./stop.js";
import { pickedTierRule } from "./tier.js";
import { VIA_SERVICE } from "./via-service.js";

export type StopsSettings = Pick<Settings, "mealVisitMinutes">;

// Where a moved stop goes (domain model 4.6, moveStop()).
export interface StopMove {
  toDay: Day;
  // Null puts it first on the day.
  after: Stop | null;
  // The tool always restates it, so an old time never carries over.
  setTime: ScheduleTime | null;
}

// The business rules about stops: whether a stop fits its day, rejected places, the
// meal visit time, and opening hours approvals (domain model 4.6).
export class StopsService {
  readonly #settings: StopsSettings;
  readonly #calendar: Calendar;

  constructor(given: { settings: StopsSettings; calendar: Calendar }) {
    this.#settings = given.settings;
    this.#calendar = given.calendar;
  }

  // Code creates the stops first, with their own rules. Here the search area rule is
  // hard: a stop that doesn't fit the day refuses the whole call.
  addStops(
    itinerary: Itinerary,
    day: Day,
    stops: readonly Stop[],
    after: Stop | null,
  ): void {
    const held = itinerary.days.flatMap((each) => each.stops);
    const fit = this.#fitOf(itinerary, day);
    const problems = stops.flatMap((stop) =>
      problemsOf(stop, held, fit).map(
        (text) => `${describeStop(stop)} ${text}`,
      ),
    );
    if (problems.length > 0) {
      throw new RuleError(`No stops were added. ${problems.join(" ")}`);
    }
    day[VIA_SERVICE].placeStops(stops, after);
  }

  // The stop keeps its candidates, selection, visit time, and approvals. Here the
  // search area rule is soft, except for a stop along the leg: the checks warn about a
  // stop near a stay that no longer fits its day.
  moveStop(itinerary: Itinerary, stop: Stop, move: StopMove): void {
    const { toDay, after, setTime } = move;
    const fromDay = this.#calendar.dayOf(itinerary, stop);
    this.#calendar.orderOf(itinerary, toDay);
    if (
      stop.searchArea === "alongLeg" &&
      this.#calendar.isStayingPut(itinerary, toDay)
    ) {
      throw new RuleError(
        `${describeStop(stop)} is along the leg, and that day stays put, so it has no leg to be along. Remove the stop and add a new one instead.`,
      );
    }
    refuseUntimedOnRestDay(toDay, stop, setTime);
    // The day's own rules refuse an `after` that isn't on it, or is the stop itself.
    toDay[VIA_SERVICE].placeStops([stop], after);
    if (fromDay !== toDay) {
      fromDay[VIA_SERVICE].removeStops([stop]);
    }
    stop[VIA_SERVICE].setSetTime(setTime);
  }

  // The stops can be on several days. Each is found before any is removed, so a stop
  // that isn't in the itinerary refuses the whole call.
  removeStops(itinerary: Itinerary, stops: readonly Stop[]): void {
    const onDays = stops.map(
      (stop) => [this.#calendar.dayOf(itinerary, stop), stop] as const,
    );
    onDays.forEach(([day, stop]) => {
      day[VIA_SERVICE].removeStops([stop]);
    });
  }

  // Null means it follows the stop before it.
  setStopTime(
    itinerary: Itinerary,
    stop: Stop,
    setTime: ScheduleTime | null,
  ): void {
    refuseUntimedOnRestDay(
      this.#calendar.dayOf(itinerary, stop),
      stop,
      setTime,
    );
    stop[VIA_SERVICE].setSetTime(setTime);
  }

  // For a stop along the leg, code works out the detour times first (domain model 4.7).
  addCandidates(
    itinerary: Itinerary,
    stop: Stop,
    offers: readonly CandidateOffer[],
  ): void {
    refuseRejectedPlaces(itinerary, offers);
    stop[VIA_SERVICE].addCandidates(offers);
  }

  // Selecting the place that's already selected changes nothing. Otherwise the stop
  // gets the visit time, and a meal the tier of the candidate the user picked. The
  // stop removes its opening hours approval itself, since it was for the old place.
  selectCandidate(stop: Stop, place: Place): void {
    if (stop.selectedPlace?.id === place.id) {
      return;
    }
    const candidate = stop.candidates.find(
      (each) => each.place.id === place.id,
    );
    if (candidate === undefined) {
      throw new RuleError(
        `${place.name ?? place.id} isn't one of the stop's candidates.`,
      );
    }
    const visitTimeInMinutes =
      candidate.visitTimeInMinutes ?? this.#settings.mealVisitMinutes;
    stop[VIA_SERVICE].selectCandidate(place, visitTimeInMinutes);
    if (
      stop.kind === "meal" &&
      candidate.tier !== null &&
      candidate.tier !== stop.tier
    ) {
      stop.setTier(candidate.tier, pickedTierRule(candidate.tier));
    }
  }

  // Records how many minutes of the visit now fall within the place's opening hours.
  approveOpeningHours(itinerary: Itinerary, stop: Stop, reason: string): void {
    const place = stop.selectedPlace;
    if (place === null || place.openingPeriods.length === 0) {
      throw new RuleError(
        `${describeStop(stop)} has no selected place with known opening hours, so there's no opening hours warning to approve.`,
      );
    }
    const openTimeInMinutes = this.#calendar.openTimeInMinutesOf(
      itinerary,
      stop,
    );
    if (openTimeInMinutes === null) {
      throw new RuleError(
        `${describeStop(stop)} has no visit times yet, such as before the trip has a start date, or after a stop with no place and no set time. There's nothing to approve until it does.`,
      );
    }
    stop[VIA_SERVICE].setApproval(
      new OpeningHoursApproval({
        reason,
        approvedOpenTimeInMinutes: openTimeInMinutes,
      }),
    );
  }

  // Does nothing when the stop has none of that kind. A stop's approvals are via
  // service.
  removeApproval(stop: Stop, kind: ApprovalKind): void {
    stop[VIA_SERVICE].removeApproval(kind);
  }

  // What decides whether a stop fits the day.
  #fitOf(itinerary: Itinerary, day: Day): DayFit {
    const calendar = this.#calendar;
    return {
      startStay: calendar.startStayOf(itinerary, day),
      endStay: calendar.endStayOf(itinerary, day),
      isStayingPut: calendar.isStayingPut(itinerary, day),
      isFirstDay: calendar.previousDay(itinerary, day) === null,
      isLastDay: day === itinerary.lastDay,
      isRestDay: isRestDay(day),
    };
  }
}

interface DayFit {
  startStay: Stay | null;
  endStay: Stay | null;
  isStayingPut: boolean;
  isFirstDay: boolean;
  isLastDay: boolean;
  isRestDay: boolean;
}

// Each way a stop can fail to fit its day when it's added (domain model 4.6, addStops()).
const MISFITS: readonly {
  applies: (stop: Stop, fit: DayFit) => boolean;
  text: string;
}[] = [
  {
    applies: (stop, fit) =>
      stop.searchAreaStay !== null &&
      stop.searchAreaStay !== fit.startStay &&
      stop.searchAreaStay !== fit.endStay,
    text: "is near a stay this day doesn't start or end at.",
  },
  {
    applies: (stop, fit) => stop.searchArea === "alongLeg" && fit.isStayingPut,
    text: "is along the leg, but this day stays put, so it has no leg to be along.",
  },
  {
    applies: (stop, fit) =>
      stop.searchArea === "nearStartPlace" && !fit.isFirstDay,
    text: "is near the start place, but this isn't the first day.",
  },
  {
    applies: (stop, fit) =>
      stop.searchArea === "nearEndPlace" && !fit.isLastDay,
    text: "is near the end place, but this isn't the last day.",
  },
  {
    applies: (stop, fit) => fit.isRestDay && stop.setTime === null,
    text: "has no set time, and each stop on a rest day needs one.",
  },
];

// Why a stop can't be added to the day, if it can't.
function problemsOf(stop: Stop, held: readonly Stop[], fit: DayFit): string[] {
  if (held.includes(stop)) {
    return ["is already in the itinerary."];
  }
  return MISFITS.filter((misfit) => misfit.applies(stop, fit)).map(
    (misfit) => misfit.text,
  );
}

function isRestDay(day: Day): boolean {
  return day instanceof StayDay && day.isRestDay;
}

// Nothing would place a stop with no set time in a day with no drives.
function refuseUntimedOnRestDay(
  day: Day,
  stop: Stop,
  setTime: ScheduleTime | null,
): void {
  if (setTime === null && isRestDay(day)) {
    throw new RuleError(
      `${describeStop(stop)} needs a set time, since each stop on a rest day has one.`,
    );
  }
}
