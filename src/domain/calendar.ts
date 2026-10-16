import type { Settings } from "../config/settings.schema.js";
import type { CalendarDate } from "./calendar-date.js";
import { describeStop, type Day } from "./day.js";
import {
  minuteOf,
  type TimelineEntry,
  timelineOf,
  toScheduleEntry,
} from "./day-timeline.js";
import type { Itinerary } from "./itinerary.js";
import { openMinutesWithin } from "./open-minutes.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import type { ScheduleEntry } from "./schedule-entry.js";
import { Stay } from "./stay.js";
import { StayDay } from "./stay-day.js";
import { Stop } from "./stop.js";
import type { TimeOfDay } from "./time-of-day.js";
import { todayAt } from "./today.js";
import type { TripBrief } from "./trip-brief.js";
import { isTextOutOfDate } from "./weather-out-of-date.js";

export type CalendarSettings = Pick<Settings, "driveBufferPercent">;

// What a calendar is given (domain model 4.1).
export interface CalendarGiven {
  // For the usual start time. It's read on each call, so a change shows at once.
  tripBrief: TripBrief;
  settings: CalendarSettings;
  // The current moment, for today's date. Code passes the system clock, and tests a
  // fixed time.
  now: () => Date;
}

// Lookup functions over the itinerary, for what an object can't work out itself: the
// object that holds it, or the ones beside it (domain model 4.1). It holds no data, and
// is created for one trip. Each function refuses an object that isn't in the itinerary.
export class Calendar {
  readonly #given: CalendarGiven;

  constructor(given: CalendarGiven) {
    this.#given = given;
  }

  // A stay's position in the stays, a day's in the days, or a stop's in its day.
  orderOf(itinerary: Itinerary, item: Stay | Day | Stop): number {
    if (item instanceof Stay) {
      return indexIn(itinerary.stays, item, `stay ${item.id}`);
    }
    if (item instanceof Stop) {
      return this.dayOf(itinerary, item).stops.indexOf(item);
    }
    return indexIn(itinerary.days, item, `day ${item.id}`);
  }

  dayOf(itinerary: Itinerary, stop: Stop): Day {
    const day = itinerary.days.find((each) => each.stops.includes(stop));
    if (day === undefined) {
      throw new RuleError(`The itinerary has no stop ${describeStop(stop)}.`);
    }
    return day;
  }

  previousDay(itinerary: Itinerary, day: Day): Day | null {
    return itinerary.days[this.orderOf(itinerary, day) - 1] ?? null;
  }

  nextDay(itinerary: Itinerary, day: Day): Day | null {
    return itinerary.days[this.orderOf(itinerary, day) + 1] ?? null;
  }

  // Today's date in the start place's time zone. Empty while there's no start place.
  today(itinerary: Itinerary): CalendarDate | null {
    const startPlace = itinerary.startPlace;
    return startPlace === null ? null : todayAt(startPlace, this.#given.now());
  }

  dateOf(itinerary: Itinerary, day: Day): CalendarDate | null {
    const order = this.orderOf(itinerary, day);
    return itinerary.startDate?.plusDays(order) ?? null;
  }

  // The dates of its nights, plus the morning the party leaves.
  datesOf(itinerary: Itinerary, stay: Stay): CalendarDate[] {
    const firstDay = stay.days[0];
    const firstDate =
      firstDay === undefined ? null : this.dateOf(itinerary, firstDay);
    if (firstDate === null) {
      return [];
    }
    return Array.from({ length: stay.nightCount + 1 }, (slot, index) =>
      firstDate.plusDays(index),
    );
  }

  // Where the party slept the night before. Empty on the first day.
  startStayOf(itinerary: Itinerary, day: Day): Stay | null {
    const previous = this.previousDay(itinerary, day);
    return previous === null ? null : stayHolding(itinerary, previous);
  }

  // Where the party sleeps. Empty on the last day.
  endStayOf(itinerary: Itinerary, day: Day): Stay | null {
    this.orderOf(itinerary, day);
    return stayHolding(itinerary, day);
  }

  fromPlaceOf(itinerary: Itinerary, day: Day): Place | null {
    const stay = this.startStayOf(itinerary, day);
    return stay === null ? itinerary.startPlace : stay.sleepsAt;
  }

  toPlaceOf(itinerary: Itinerary, day: Day): Place | null {
    const stay = this.endStayOf(itinerary, day);
    return stay === null ? itinerary.endPlace : stay.sleepsAt;
  }

  isStayingPut(itinerary: Itinerary, day: Day): boolean {
    const start = this.startStayOf(itinerary, day);
    return start !== null && start === this.endStayOf(itinerary, day);
  }

  // The towns the day runs between, by the stays' places, not their lodging, such as
  // "Monterey → San Luis Obispo", or "Moab" on a day that stays put.
  locationOf(itinerary: Itinerary, day: Day): string | null {
    const from =
      this.startStayOf(itinerary, day)?.place ?? itinerary.startPlace;
    const to = this.endStayOf(itinerary, day)?.place ?? itinerary.endPlace;
    if (from === null || to === null) {
      return null;
    }
    if (this.isStayingPut(itinerary, day)) {
      return townName(to);
    }
    return `${townName(from)} → ${townName(to)}`;
  }

  startTimeOf(itinerary: Itinerary, day: Day): TimeOfDay {
    this.orderOf(itinerary, day);
    return day.ownStartTime ?? this.#given.tripBrief.usualStartTime;
  }

  scheduleOf(itinerary: Itinerary, day: Day): ScheduleEntry[] {
    return this.#timelineOf(itinerary, day).map(toScheduleEntry);
  }

  // How many minutes of the stop's visit fall within its selected place's opening
  // hours. Empty when it has no selected place, its place's hours aren't known, or its
  // date or times aren't known yet.
  openTimeInMinutesOf(itinerary: Itinerary, stop: Stop): number | null {
    const place = stop.selectedPlace;
    const day = this.dayOf(itinerary, stop);
    const date = this.dateOf(itinerary, day);
    if (place === null || place.openingPeriods.length === 0 || date === null) {
      return null;
    }
    const entry = this.#timelineOf(itinerary, day).find(
      (each) => each.stop === stop,
    );
    if (entry?.startMinute == null || entry.endMinute === null) {
      return null;
    }
    return openMinutesWithin(place.openingPeriods, date.weekday, {
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
    });
  }

  // The attraction stops the stay's weather text is written for, in the days' order.
  activitiesOf(itinerary: Itinerary, stay: Stay): Stop[] {
    const order = this.orderOf(itinerary, stay);
    const covers = activityRule(itinerary, stay, {
      isFirst: order === 0,
      isLast: order === itinerary.stays.length - 1,
    });
    return itinerary.days.flatMap((day) =>
      day.stops.filter(
        (stop) => stop.kind === "attraction" && covers(day, stop),
      ),
    );
  }

  isWeatherOutOfDate(itinerary: Itinerary, stay: Stay): boolean {
    const text = stay.weatherText;
    if (text === null) {
      return itinerary.stays.some((each) => each.weatherText !== null);
    }
    return isTextOutOfDate(text, {
      place: stay.place,
      dates: this.datesOf(itinerary, stay),
      activities: this.activitiesOf(itinerary, stay),
    });
  }

  #timelineOf(itinerary: Itinerary, day: Day): TimelineEntry[] {
    const hasDrives = this.#hasDrives(itinerary, day);
    return timelineOf({
      stops: day.stops,
      startMinute: minuteOf(this.startTimeOf(itinerary, day)),
      hasDrives,
      driveMinutes: hasDrives ? this.#driveMinutesOf(day) : null,
    });
  }

  // A rest day has no drives, and nor does a day that stays put with no selected stop,
  // since it has nothing to drive to (domain model 4.7, "Which days have a leg").
  #hasDrives(itinerary: Itinerary, day: Day): boolean {
    if (day instanceof StayDay && day.isRestDay) {
      return false;
    }
    return (
      !this.isStayingPut(itinerary, day) ||
      day.stops.some((stop) => stop.selectedPlace !== null)
    );
  }

  // Each segment's drive time plus the buffer, rounded up to the whole minute. Null
  // while the leg wasn't routed through the day's selected places, such as partway
  // through a write, before the leg is re-routed.
  #driveMinutesOf(day: Day): number[] | null {
    const leg = day.leg;
    const selected = day.stops.flatMap((stop) => stop.selectedPlace ?? []);
    const isRoutedForThem =
      leg !== null &&
      leg.segmentDriveTimesInMinutes.length === selected.length + 1 &&
      leg.routedStopPlaces.length === selected.length &&
      leg.routedStopPlaces.every(
        (place, index) => place.id === selected[index]?.id,
      );
    if (!isRoutedForThem) {
      return null;
    }
    const percent = this.#given.settings.driveBufferPercent;
    return leg.segmentDriveTimesInMinutes.map((minutes) =>
      Math.ceil((minutes * (100 + percent)) / 100),
    );
  }
}

function indexIn<T>(items: readonly T[], item: T, name: string): number {
  const index = items.indexOf(item);
  if (index < 0) {
    throw new RuleError(`The itinerary has no ${name}.`);
  }
  return index;
}

// Which attraction stops a stay's activities cover (domain model 4.1, "Activities").
function activityRule(
  itinerary: Itinerary,
  stay: Stay,
  where: { isFirst: boolean; isLast: boolean },
): (day: Day, stop: Stop) => boolean {
  return (day, stop) => {
    const isAlongLeg = stop.searchArea === "alongLeg";
    const isStayDay = stay.days.some((each) => each === day);
    return (
      stop.searchAreaStay === stay ||
      (isAlongLeg && isStayDay) ||
      (where.isFirst && stop.searchArea === "nearStartPlace") ||
      (where.isLast && stop.searchArea === "nearEndPlace") ||
      (where.isLast && isAlongLeg && day === itinerary.lastDay)
    );
  };
}

function stayHolding(itinerary: Itinerary, day: Day): Stay | null {
  return (
    itinerary.stays.find((stay) => stay.days.some((each) => each === day)) ??
    null
  );
}

// An address Google gave no name, and no agent named yet, shows as its address.
function townName(place: Place): string {
  return place.name ?? place.address;
}
