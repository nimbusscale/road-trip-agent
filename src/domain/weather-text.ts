import type { CalendarDate } from "./calendar-date.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import type { WeatherLabel } from "./weather-label.js";

// One of the activities a weather text was written for: a stop, and its selected place
// then (domain model 3.5). A stop ID, not a link, since the stop can be removed later.
export class ActivityRecord {
  readonly stopId: string;
  readonly selectedPlace: Place | null;

  constructor(fields: { stopId: string; selectedPlace: Place | null }) {
    this.stopId = fields.stopId;
    this.selectedPlace = fields.selectedPlace;
  }
}

export interface WeatherTextFields {
  guidance: string;
  label: WeatherLabel;
  writtenOnDate: CalendarDate;
  writtenForPlace: Place;
  writtenForDates: readonly CalendarDate[];
  writtenForActivities: readonly ActivityRecord[];
}

// A stay's weather and clothing guidance (domain model 3.5). A new one replaces the old
// one whole, so it never changes. It records what it was written for, so the calendar
// can tell when it's out of date.
export class WeatherText {
  readonly guidance: string;
  readonly label: WeatherLabel;
  readonly writtenOnDate: CalendarDate;
  readonly writtenForPlace: Place;
  readonly writtenForDates: readonly CalendarDate[];
  readonly writtenForActivities: readonly ActivityRecord[];

  constructor(fields: WeatherTextFields) {
    if (fields.guidance.trim() === "") {
      throw new RuleError("A weather text's guidance can't be empty.");
    }
    this.guidance = fields.guidance;
    this.label = fields.label;
    this.writtenOnDate = fields.writtenOnDate;
    this.writtenForPlace = fields.writtenForPlace;
    this.writtenForDates = Object.freeze([...fields.writtenForDates]);
    this.writtenForActivities = Object.freeze([...fields.writtenForActivities]);
  }
}
