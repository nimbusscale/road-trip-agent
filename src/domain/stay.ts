import { newId } from "../ids/new-id.js";
import {
  type Candidate,
  type CandidateOffer,
  newCandidateSet,
  refuseRepeatedPlaces,
} from "./candidate.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import { StayDay } from "./stay-day.js";
import { pickedTierRule, type Tier } from "./tier.js";
import { VIA_SERVICE } from "./via-service.js";
import type { WeatherText } from "./weather-text.js";

// What StaysService.addStay() gives a new stay.
export interface NewStayFields {
  place: Place;
  nightCount: number;
  tier: Tier;
  tierRule: string;
}

export interface StayFields {
  id: string;
  place: Place;
  lodging: Place | null;
  lodgingCandidates: readonly Candidate[];
  tier: Tier;
  tierRule: string;
  days: readonly StayDay[];
  weatherText: WeatherText | null;
}

// The change methods only services reach (domain model section 1). Each runs the
// stay's own rules.
export interface StayChanges {
  // Adds one set, and returns the candidates as the stay made them.
  addLodgingCandidates(offers: readonly CandidateOffer[]): Candidate[];
  // Only a rejection removes a candidate. The selected one clears the lodging.
  removeLodgingCandidate(place: Place): void;
  // Adds or removes days at the end. Returns the days added.
  setNightCount(nightCount: number): StayDay[];
  setWeatherText(weatherText: WeatherText): void;
}

// An overnight location, for one or more nights (domain model 3.5). It holds the days
// that end with a night there.
export class Stay {
  readonly id: string;
  // Where it is, usually a town. Set directly. A Place always has its facts, so there's
  // no rule to run.
  place: Place;
  #lodging: Place | null;
  #lodgingCandidates: Candidate[];
  #tier: Tier;
  #tierRule: string;
  #days: StayDay[];
  #weatherText: WeatherText | null;

  readonly [VIA_SERVICE]: StayChanges = {
    addLodgingCandidates: (offers) => {
      const set = newCandidateSet(this.#lodgingCandidates, offers, {
        tier: this.#tier,
        tierRule: this.#tierRule,
      });
      set.forEach(refuseUnfitLodging);
      this.#lodgingCandidates.push(...set);
      return set;
    },
    removeLodgingCandidate: (place) => {
      this.#lodgingCandidates = this.#lodgingCandidates.filter(
        (candidate) => candidate.place.id !== place.id,
      );
      if (this.#lodging?.id === place.id) {
        this.#lodging = null;
      }
    },
    setNightCount: (nightCount) => this.#setNightCount(nightCount),
    setWeatherText: (weatherText) => {
      this.#weatherText = weatherText;
    },
  };

  constructor(fields: StayFields) {
    this.id = fields.id;
    this.place = fields.place;
    this.#tier = fields.tier;
    this.#tierRule = checkedTierRule(fields.tierRule);
    if (fields.days.length < 1) {
      throw new RuleError("A stay holds at least one day.");
    }
    this.#days = [...fields.days];
    this.#lodgingCandidates = [...fields.lodgingCandidates];
    this.#lodgingCandidates.forEach(refuseUnfitLodging);
    refuseRepeatedPlaces(this.#lodgingCandidates);
    this.#lodging = null;
    if (fields.lodging !== null) {
      this.#selectLodging(fields.lodging);
    }
    this.#weatherText = fields.weatherText;
  }

  // Where the party sleeps, once selected. Always one of the lodging candidates.
  get lodging(): Place | null {
    return this.#lodging;
  }

  // In the order offered.
  get lodgingCandidates(): readonly Candidate[] {
    return Object.freeze([...this.#lodgingCandidates]);
  }

  get tier(): Tier {
    return this.#tier;
  }

  get tierRule(): string {
    return this.#tierRule;
  }

  // One for each night, in order.
  get days(): readonly StayDay[] {
    return Object.freeze([...this.#days]);
  }

  get weatherText(): WeatherText | null {
    return this.#weatherText;
  }

  get nightCount(): number {
    return this.#days.length;
  }

  // Legs start and end here: the lodging once one is selected, and the town until then.
  get sleepsAt(): Place {
    return this.#lodging ?? this.place;
  }

  // A later change to the nights or the rules leaves it as it is (technical spec
  // section 9).
  setTier(tier: Tier, tierRule: string): void {
    this.#tierRule = checkedTierRule(tierRule);
    this.#tier = tier;
  }

  // Selects one of the stay's candidates as its lodging. A candidate offered at another
  // tier sets the stay's tier to it. One the user named has no tier, so the tier stays.
  selectCandidate(place: Place): void {
    const candidate = this.#selectLodging(place);
    if (candidate.tier !== null && candidate.tier !== this.#tier) {
      this.setTier(candidate.tier, pickedTierRule(candidate.tier));
    }
  }

  // Places are matched by ID, like everywhere else in the trip.
  #selectLodging(place: Place): Candidate {
    const candidate = this.#lodgingCandidates.find(
      (each) => each.place.id === place.id,
    );
    if (candidate === undefined) {
      throw new RuleError(
        `${place.name ?? place.id} isn't one of the stay's lodging candidates.`,
      );
    }
    this.#lodging = candidate.place;
    return candidate;
  }

  #setNightCount(nightCount: number): StayDay[] {
    checkedNightCount(nightCount);
    const added: StayDay[] = [];
    while (this.#days.length + added.length < nightCount) {
      added.push(newStayDay());
    }
    this.#days = [...this.#days.slice(0, nightCount), ...added];
    return added;
  }
}

// A new stay, which creates its days (domain model 3.5, "Creating a stay").
export function newStay(fields: NewStayFields): Stay {
  checkedNightCount(fields.nightCount);
  const days = Array.from({ length: fields.nightCount }, newStayDay);
  return new Stay({
    id: newId("stay"),
    place: fields.place,
    lodging: null,
    lodgingCandidates: [],
    tier: fields.tier,
    tierRule: fields.tierRule,
    days,
    weatherText: null,
  });
}

// A new day isn't a rest day, and has no start time, stops, or approvals.
function newStayDay(): StayDay {
  return new StayDay({
    id: newId("day"),
    ownStartTime: null,
    approvals: [],
    isRestDay: false,
  });
}

export function checkedNightCount(nightCount: number): number {
  if (!Number.isInteger(nightCount) || nightCount < 1) {
    throw new RuleError(
      `A stay has a whole number of nights, at least 1. It was given ${String(nightCount)}.`,
    );
  }
  return nightCount;
}

function checkedTierRule(tierRule: string): string {
  if (tierRule.trim() === "") {
    throw new RuleError("A stay's tier needs the rule that produced it.");
  }
  return tierRule;
}

// Visit and detour times are for stops (domain model 3.5).
function refuseUnfitLodging(candidate: Candidate): void {
  if (
    candidate.visitTimeInMinutes !== null ||
    candidate.detourTimeInMinutes !== null
  ) {
    throw new RuleError(
      `${candidate.place.name ?? candidate.place.id} doesn't fit as lodging: a lodging candidate has no visit time or detour time.`,
    );
  }
}
