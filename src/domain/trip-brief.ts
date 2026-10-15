import { keptText, keptValue, startingValue } from "./keeps-value.js";
import type { RouteType } from "./route-type.js";
import { RuleError } from "./rule-error.js";
import type { Tier } from "./tier.js";
import { VIA_SERVICE } from "./via-service.js";

// What a trip brief stores, to create one: a new one, or one read back from storage.
export interface TripBriefFields {
  id: string;
  focus: string | null;
  tripLengthInDays: number | null;
  interestsText: string | null;
  mustSeesText: string | null;
  comfortableDrivingInHours: number | null;
  routePreference: RouteType | null;
  restDaysText: string | null;
  usualStartTime: string;
  defaultTier: Tier | null;
  budgetRulesText: string | null;
  mealPreferencesText: string | null;
}

// A time of day, as "HH:MM" on a 24-hour clock, such as "08:00" or "17:30".
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_USUAL_START_TIME = "08:00";

// What the user wants from the trip (domain model section 3.2). Every item but
// usualStartTime is {keepsValue}. tripLengthInDays and comfortableDrivingInHours are
// {viaService}: TripBriefService sets them, since their limits are settings.
export class TripBrief {
  readonly id: string;
  #focus: string | null;
  #tripLengthInDays: number | null;
  #interestsText: string | null;
  #mustSeesText: string | null;
  #comfortableDrivingInHours: number | null;
  #routePreference: RouteType | null;
  #restDaysText: string | null;
  #usualStartTime: string;
  #defaultTier: Tier | null;
  #budgetRulesText: string | null;
  #mealPreferencesText: string | null;

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
    this.#comfortableDrivingInHours = startingValue(
      fields.comfortableDrivingInHours,
      checkedComfortableDriving,
    );
    this.#routePreference = fields.routePreference;
    this.#restDaysText = startingValue(
      fields.restDaysText,
      keptItemText("restDaysText"),
    );
    this.#usualStartTime = checkedUsualStartTime(fields.usualStartTime);
    this.#defaultTier = fields.defaultTier;
    this.#budgetRulesText = startingValue(
      fields.budgetRulesText,
      keptItemText("budgetRulesText"),
    );
    this.#mealPreferencesText = startingValue(
      fields.mealPreferencesText,
      keptItemText("mealPreferencesText"),
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

  get comfortableDrivingInHours(): number | null {
    return this.#comfortableDrivingInHours;
  }

  get routePreference(): RouteType | null {
    return this.#routePreference;
  }

  set routePreference(value: RouteType | null) {
    this.#routePreference = keptValue(value, itemName("routePreference"));
  }

  get restDaysText(): string | null {
    return this.#restDaysText;
  }

  set restDaysText(value: string | null) {
    this.#restDaysText = keptText(value, itemName("restDaysText"));
  }

  get usualStartTime(): string {
    return this.#usualStartTime;
  }

  set usualStartTime(value: string) {
    this.#usualStartTime = checkedUsualStartTime(value);
  }

  get defaultTier(): Tier | null {
    return this.#defaultTier;
  }

  set defaultTier(value: Tier | null) {
    this.#defaultTier = keptValue(value, itemName("defaultTier"));
  }

  get budgetRulesText(): string | null {
    return this.#budgetRulesText;
  }

  set budgetRulesText(value: string | null) {
    this.#budgetRulesText = keptText(value, itemName("budgetRulesText"));
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

function checkedUsualStartTime(value: string): string {
  if (!TIME_OF_DAY.test(value)) {
    throw new RuleError(
      `The trip brief's usualStartTime has to be a time of day as HH:MM, such as 08:00. It was given "${value}".`,
    );
  }
  return value;
}
