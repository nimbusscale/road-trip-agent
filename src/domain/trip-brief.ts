import { keptText, keptValue, startingValue } from "./keeps-value.js";
import type { RouteType } from "./route-type.js";
import { RuleError } from "./rule-error.js";
import { EIGHT_A_M, type TimeOfDay } from "./time-of-day.js";
import { VIA_SERVICE } from "./via-service.js";

// What a trip brief stores, to create one: a new one, or one read back from storage.
export interface TripBriefFields {
  id: string;
  focus: string | null;
  tripLengthInDays: number | null;
  interestsText: string | null;
  mustSeesText: string | null;
  comfortableDrivingInHours: number;
  routePreference: RouteType | null;
  usualStartTime: TimeOfDay;
  mealPreferencesText: string | null;
  lodgingPreferencesText: string | null;
}

export const DEFAULT_USUAL_START_TIME = EIGHT_A_M;

// What the user wants from the trip (domain model section 3.2). Every item but
// comfortableDrivingInHours and usualStartTime is {keepsValue}. tripLengthInDays and comfortableDrivingInHours are
// {viaService}: TripBriefService sets them, since their limits are settings.
export class TripBrief {
  readonly id: string;
  #focus: string | null;
  #tripLengthInDays: number | null;
  #interestsText: string | null;
  #mustSeesText: string | null;
  // Never empty: a new trip starts with the default comfortable driving hours.
  #comfortableDrivingInHours: number;
  #routePreference: RouteType | null;
  #mealPreferencesText: string | null;
  #lodgingPreferencesText: string | null;
  // Never empty. A TimeOfDay is always a valid time, so it has no rules to run here.
  usualStartTime: TimeOfDay;

  // Only services reach these (domain model section 1). Each runs the brief's own rules.
  readonly [VIA_SERVICE] = {
    setTripLengthInDays: (value: number): void => {
      this.#tripLengthInDays = checkedTripLength(value);
    },
    setComfortableDrivingInHours: (value: number): void => {
      this.#comfortableDrivingInHours = checkedComfortableDriving(value);
    },
  };

  constructor(fields: TripBriefFields) {
    this.id = fields.id;
    this.#focus = startingValue(fields.focus, keptItemText("focus"));
    this.#tripLengthInDays = startingValue(
      fields.tripLengthInDays,
      checkedTripLength,
    );
    this.#interestsText = startingValue(
      fields.interestsText,
      keptItemText("interestsText"),
    );
    this.#mustSeesText = startingValue(
      fields.mustSeesText,
      keptItemText("mustSeesText"),
    );
    this.#comfortableDrivingInHours = checkedComfortableDriving(
      fields.comfortableDrivingInHours,
    );
    this.#routePreference = fields.routePreference;
    this.usualStartTime = fields.usualStartTime;
    this.#mealPreferencesText = startingValue(
      fields.mealPreferencesText,
      keptItemText("mealPreferencesText"),
    );
    this.#lodgingPreferencesText = startingValue(
      fields.lodgingPreferencesText,
      keptItemText("lodgingPreferencesText"),
    );
  }

  get focus(): string | null {
    return this.#focus;
  }

  set focus(value: string | null) {
    this.#focus = keptText(value, itemName("focus"));
  }

  get tripLengthInDays(): number | null {
    return this.#tripLengthInDays;
  }

  get interestsText(): string | null {
    return this.#interestsText;
  }

  set interestsText(value: string | null) {
    this.#interestsText = keptText(value, itemName("interestsText"));
  }

  get mustSeesText(): string | null {
    return this.#mustSeesText;
  }

  set mustSeesText(value: string | null) {
    this.#mustSeesText = keptText(value, itemName("mustSeesText"));
  }

  get comfortableDrivingInHours(): number {
    return this.#comfortableDrivingInHours;
  }

  get routePreference(): RouteType | null {
    return this.#routePreference;
  }

  set routePreference(value: RouteType | null) {
    this.#routePreference = keptValue(value, itemName("routePreference"));
  }

  get mealPreferencesText(): string | null {
    return this.#mealPreferencesText;
  }

  set mealPreferencesText(value: string | null) {
    this.#mealPreferencesText = keptText(
      value,
      itemName("mealPreferencesText"),
    );
  }

  get lodgingPreferencesText(): string | null {
    return this.#lodgingPreferencesText;
  }

  set lodgingPreferencesText(value: string | null) {
    this.#lodgingPreferencesText = keptText(
      value,
      itemName("lodgingPreferencesText"),
    );
  }
}

function itemName(name: string): string {
  return `The trip brief's ${name}`;
}

function keptItemText(name: string): (value: string) => string {
  return (value) => keptText(value, itemName(name));
}

function checkedTripLength(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RuleError(
      `The trip brief's tripLengthInDays has to be a whole number of days, at least 1. It was given ${String(value)}.`,
    );
  }
  return value;
}

function checkedComfortableDriving(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RuleError(
      `The trip brief's comfortableDrivingInHours has to be more than 0. It was given ${String(value)}.`,
    );
  }
  return value;
}
