import type { OpeningPeriod } from "./opening-period.js";
import type { PriceLevel } from "./price-level.js";
import { RuleError } from "./rule-error.js";

// What a place stores, to create one: from a Google lookup, or read back from storage.
export interface PlaceFields {
  id: string;
  googlePlaceId: string;
  name: string | null;
  type: string | null;
  address: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: PriceLevel | null;
  openingPeriods: readonly OpeningPeriod[];
  weekdayHoursLines: readonly string[];
  summaries: readonly string[];
  links: readonly string[];
}

// How the short line shows each price level, as Google Maps does.
const PRICE_LEVEL_TEXT: Readonly<Record<PriceLevel, string>> = {
  free: "free",
  inexpensive: "$",
  moderate: "$$",
  expensive: "$$$",
  veryExpensive: "$$$$",
};

// Google's address ends with the state and the country, so the town comes just before
// them, as in "208 S Commerce St, Lockhart, TX 78644, USA".
const ADDRESS_PARTS_AFTER_TOWN = 2;

// A real location: a town, hotel, restaurant, attraction, or friend's house (domain
// model 3.10). Its facts are a snapshot of a Google lookup and never change. Only the
// name can be filled in, once, when Google has none.
export class Place {
  readonly id: string;
  readonly googlePlaceId: string;
  readonly type: string | null;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly priceLevel: PriceLevel | null;
  readonly openingPeriods: readonly OpeningPeriod[];
  readonly weekdayHoursLines: readonly string[];
  readonly summaries: readonly string[];
  readonly links: readonly string[];
  #name: string | null;

  constructor(fields: PlaceFields) {
    refuseOpenPeriodAmongOthers(fields.openingPeriods);
    this.id = fields.id;
    this.googlePlaceId = fields.googlePlaceId;
    this.#name = fields.name === null ? null : checkedName(fields.name);
    this.type = fields.type;
    this.address = fields.address;
    this.latitude = fields.latitude;
    this.longitude = fields.longitude;
    this.rating = fields.rating;
    this.reviewCount = fields.reviewCount;
    this.priceLevel = fields.priceLevel;
    this.openingPeriods = Object.freeze([...fields.openingPeriods]);
    this.weekdayHoursLines = Object.freeze([...fields.weekdayHoursLines]);
    this.summaries = Object.freeze([...fields.summaries]);
    this.links = Object.freeze([...fields.links]);
  }

  // Google's name, or the first name an agent gave a place Google has no name for.
  get name(): string | null {
    return this.#name;
  }

  // One line about the place for the coordinator, such as "Hotel, 4.6 stars, $$,
  // Austin" (technical spec 7.2). A part that's empty is left out.
  get shortLine(): string {
    const parts = [
      this.type,
      this.rating === null ? null : `${this.rating.toFixed(1)} stars`,
      this.priceLevel === null ? null : PRICE_LEVEL_TEXT[this.priceLevel],
      this.town,
    ];
    return parts.filter((part) => part !== null).join(", ");
  }

  // The town from the address, as the short line gives it. Null when it's only the
  // place's own name, such as for a town, or "Delicate Arch Trail, Utah, USA", whose
  // address has no town.
  get town(): string | null {
    const town = townOf(this.address);
    return town === this.#name ? null : town;
  }

  // Sets the name when the place has none. A name already set stays as it is, so a
  // nickname such as "the pink hotel" never replaces "Madonna Inn".
  fillName(name: string): void {
    const checked = checkedName(name);
    this.#name ??= checked;
  }
}

function checkedName(name: string): string {
  if (name.trim() === "") {
    throw new RuleError("A place's name can't be empty.");
  }
  return name;
}

// Google gives a place that's always open as one period with no closing. Any other
// period has a closing (domain model 3.10).
function refuseOpenPeriodAmongOthers(periods: readonly OpeningPeriod[]): void {
  if (periods.length > 1 && periods.some((period) => !period.hasClosing)) {
    throw new RuleError(
      "Only a place's one and only opening period can have no closing.",
    );
  }
}

function townOf(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim());
  const town = parts.at(-1 - ADDRESS_PARTS_AFTER_TOWN);
  return town === undefined || town === "" ? null : town;
}
