import type { Settings } from "../config/settings.schema.js";
import type { Calendar } from "./calendar.js";
import type { CandidateOffer } from "./candidate.js";
import { describeStopAndPlace } from "./day.js";
import type { Itinerary } from "./itinerary.js";
import type { Place } from "./place.js";
import { refuseRejectedPlaces } from "./refuse-rejected.js";
import { RuleError } from "./rule-error.js";
import { checkedNightCount, newStay, type Stay } from "./stay.js";
import type { StayDay } from "./stay-day.js";
import type { Stop } from "./stop.js";
import type { Tier } from "./tier.js";
import { VIA_SERVICE } from "./via-service.js";
import type { WeatherLabel } from "./weather-label.js";
import { ActivityRecord, WeatherText } from "./weather-text.js";

export type StaysSettings = Pick<Settings, "maximumTripLengthDays">;

// A stay's weather text is a forecast when every one of its dates is within this many
// days of today, counting today as day 0 (technical spec section 8).
export const FORECAST_DAYS = 7;

// What a new stay is given (domain model 4.4, addStay()).
export interface NewStay {
  place: Place;
  nightCount: number;
  tier: Tier;
  tierRule: string;
  // Null puts it first.
  after: Stay | null;
}

// The business rules about stays: the maximum trip length, stops that depend on a
// stay, rejected lodging, and the weather label (domain model 4.4).
export class StaysService {
  readonly #settings: StaysSettings;
  readonly #calendar: Calendar;

  constructor(given: { settings: StaysSettings; calendar: Calendar }) {
    this.#settings = given.settings;
    this.#calendar = given.calendar;
  }

  // Every later day moves back, and keeps its ID.
  addStay(itinerary: Itinerary, fields: NewStay): Stay {
    refuseUntilEndsAndDateAreSet(itinerary);
    this.#refuseOverLength(itinerary.dayCount + fields.nightCount);
    const stay = newStay(fields);
    itinerary[VIA_SERVICE].placeStay(stay, fields.after);
    return stay;
  }

  // Its days move with it. It needs no business rule, but stays are via service.
  moveStay(itinerary: Itinerary, stay: Stay, after: Stay | null): void {
    this.#calendar.orderOf(itinerary, stay);
    itinerary[VIA_SERVICE].placeStay(stay, after);
  }

  // Adds or removes days at the end of the stay. Returns the days added.
  setNightCount(
    itinerary: Itinerary,
    stay: Stay,
    nightCount: number,
  ): StayDay[] {
    this.#calendar.orderOf(itinerary, stay);
    checkedNightCount(nightCount);
    this.#refuseOverLength(itinerary.dayCount - stay.nightCount + nightCount);
    const held = stay.days.slice(nightCount).flatMap((day) => day.stops);
    if (held.length > 0) {
      throw new RuleError(
        `The days that would go still hold stops. Move or remove them first: ${listed(held)}.`,
      );
    }
    return stay[VIA_SERVICE].setNightCount(nightCount);
  }

  // Code never removes a stop the coordinator didn't name, so it refuses while any
  // stop depends on the stay.
  removeStay(itinerary: Itinerary, stay: Stay): void {
    const onItsDays = stay.days.flatMap((day) => day.stops);
    const nearIt = itinerary.days
      .flatMap((day) => day.stops)
      .filter(
        (stop) => stop.searchAreaStay === stay && !onItsDays.includes(stop),
      );
    const dependents = [...onItsDays, ...nearIt];
    if (dependents.length > 0) {
      throw new RuleError(
        `The stay still has stops on its days or near it. Move or remove them first: ${listed(dependents)}.`,
      );
    }
    itinerary[VIA_SERVICE].removeStay(stay);
  }

  addLodgingCandidates(
    itinerary: Itinerary,
    stay: Stay,
    offers: readonly CandidateOffer[],
  ): void {
    refuseRejectedPlaces(itinerary, offers);
    stay[VIA_SERVICE].addLodgingCandidates(offers);
  }

  // Records what the text was written for, so the calendar can tell when it's out of
  // date. The label comes from the stay's dates, not from the worker.
  setWeatherText(
    itinerary: Itinerary,
    stay: Stay,
    guidance: string,
  ): WeatherText {
    const today = this.#calendar.today(itinerary);
    const dates = this.#calendar.datesOf(itinerary, stay);
    // A stay can't be added before the start place and start date, so this is only for
    // the type checker.
    if (today === null || dates.length === 0) {
      throw new RuleError(
        "Weather text needs the trip's start place and start date.",
      );
    }
    const label: WeatherLabel = dates.every(
      (date) => date.compareTo(today) <= FORECAST_DAYS,
    )
      ? "forecast"
      : "seasonalAverages";
    const weatherText = new WeatherText({
      guidance,
      label,
      writtenOnDate: today,
      writtenForPlace: stay.place,
      writtenForDates: dates,
      writtenForActivities: this.#calendar.activitiesOf(itinerary, stay).map(
        (stop) =>
          new ActivityRecord({
            stopId: stop.id,
            selectedPlace: stop.selectedPlace,
          }),
      ),
    });
    stay[VIA_SERVICE].setWeatherText(weatherText);
    return weatherText;
  }

  #refuseOverLength(dayCount: number): void {
    const maximum = this.#settings.maximumTripLengthDays;
    if (dayCount > maximum) {
      throw new RuleError(
        `A trip is at most ${String(maximum)} days long. This would make it ${String(dayCount)}.`,
      );
    }
  }
}

// Until then, the only day is the last day, and no day's ends are known (technical spec
// 4.2).
function refuseUntilEndsAndDateAreSet(itinerary: Itinerary): void {
  const missing = [
    itinerary.startPlace === null ? "start place" : null,
    itinerary.endPlace === null ? "end place" : null,
    itinerary.startDate === null ? "start date" : null,
  ].filter((item) => item !== null);
  if (missing.length > 0) {
    throw new RuleError(
      `A stay can be added once the itinerary has its start place, end place, and start date. It still needs its ${missing.join(", ")}.`,
    );
  }
}

function listed(stops: readonly Stop[]): string {
  return stops.map(describeStopAndPlace).join("; ");
}
