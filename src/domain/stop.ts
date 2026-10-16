import { newId } from "../ids/new-id.js";
import {
  checkedApprovals,
  type OpeningHoursApproval,
  withApproval,
  withoutApproval,
} from "./approval.js";
import type { ApprovalKind } from "./approval-kind.js";
import {
  type Candidate,
  type CandidateOffer,
  newCandidateSet,
  refuseRepeatedPlaces,
} from "./candidate.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import type { ScheduleTime } from "./schedule-time.js";
import type { SearchArea } from "./search-area.js";
import type { Stay } from "./stay.js";
import type { StopKind } from "./stop-kind.js";
import type { Tier } from "./tier.js";
import { VIA_SERVICE } from "./via-service.js";

// What code gives a new stop (domain model 3.7).
export interface NewStopFields {
  kind: StopKind;
  purpose: string;
  searchArea: SearchArea;
  searchAreaStay: Stay | null;
  setTime: ScheduleTime | null;
  tier: Tier | null;
  tierRule: string | null;
}

export interface StopFields extends NewStopFields {
  id: string;
  visitTimeInMinutes: number | null;
  selectedPlace: Place | null;
  candidates: readonly Candidate[];
  approvals: readonly OpeningHoursApproval[];
}

export type StopStatus = "empty" | "proposed" | "selected";

// The change methods only services reach (domain model section 1). Each runs the
// stop's own rules.
export interface StopChanges {
  setSetTime(setTime: ScheduleTime | null): void;
  // Adds one set, and returns the candidates as the stop made them.
  addCandidates(offers: readonly CandidateOffer[]): Candidate[];
  // StopsService works out the visit time: the candidate's, or the meal setting.
  selectCandidate(place: Place, visitTimeInMinutes: number): void;
  // Only a rejection removes a candidate. A selected one clears the selection.
  removeCandidate(place: Place): void;
  setApproval(approval: OpeningHoursApproval): void;
  removeApproval(kind: ApprovalKind): void;
}

// A place the party visits during a day: a meal or an attraction (domain model 3.7).
// Its kind, purpose, and search area never change, since its candidates were found
// for them.
export class Stop {
  readonly id: string;
  readonly kind: StopKind;
  readonly purpose: string;
  readonly searchArea: SearchArea;
  // The stay, for a stop near a stay. A link, not ownership: the day holds the stop.
  readonly searchAreaStay: Stay | null;
  #setTime: ScheduleTime | null;
  #visitTimeInMinutes: number | null;
  #tier: Tier | null;
  #tierRule: string | null;
  #selectedPlace: Place | null;
  #candidates: Candidate[];
  #approvals: OpeningHoursApproval[];

  readonly [VIA_SERVICE]: StopChanges = {
    setSetTime: (setTime) => {
      this.#setTime = setTime;
    },
    addCandidates: (offers) => {
      const tiering =
        this.#tier === null || this.#tierRule === null
          ? null
          : { tier: this.#tier, tierRule: this.#tierRule };
      const set = newCandidateSet(this.#candidates, offers, tiering);
      set.forEach((candidate) => {
        this.#refuseUnfitCandidate(candidate);
      });
      this.#candidates.push(...set);
      return set;
    },
    selectCandidate: (place, visitTimeInMinutes) => {
      this.#selectCandidate(place, visitTimeInMinutes);
    },
    removeCandidate: (place) => {
      this.#candidates = this.#candidates.filter(
        (candidate) => candidate.place.id !== place.id,
      );
      if (this.#selectedPlace?.id === place.id) {
        this.#clearSelection();
      }
    },
    setApproval: (approval) => {
      this.#approvals = withApproval(this.#approvals, approval);
    },
    removeApproval: (kind) => {
      if (kind !== "openingHours") {
        throw new RuleError(
          `A stop holds no ${kind} approval. Only days hold them.`,
        );
      }
      this.#approvals = withoutApproval(this.#approvals, kind);
    },
  };

  constructor(fields: StopFields) {
    refuseBrokenNewStop(fields);
    this.id = fields.id;
    this.kind = fields.kind;
    this.purpose = fields.purpose;
    this.searchArea = fields.searchArea;
    this.searchAreaStay = fields.searchAreaStay;
    this.#setTime = fields.setTime;
    this.#tier = fields.tier;
    this.#tierRule = fields.tierRule;
    this.#candidates = [...fields.candidates];
    this.#candidates.forEach((candidate) => {
      this.#refuseUnfitCandidate(candidate);
    });
    refuseRepeatedPlaces(this.#candidates);
    this.#selectedPlace = fields.selectedPlace;
    this.#visitTimeInMinutes = fields.visitTimeInMinutes;
    this.#approvals = checkedApprovals(fields.approvals);
    this.#refuseBrokenSelection();
  }

  // "Not before", such as dinner at 7. Null means it follows the stop before it.
  get setTime(): ScheduleTime | null {
    return this.#setTime;
  }

  // Has a value exactly when a place is selected.
  get visitTimeInMinutes(): number | null {
    return this.#visitTimeInMinutes;
  }

  // Set directly when the user asks, such as "plan five hours for that hike".
  set visitTimeInMinutes(value: number | null) {
    if (this.#selectedPlace === null) {
      throw noPlaceForVisitTime();
    }
    this.#visitTimeInMinutes = checkedVisitTime(value);
  }

  get tier(): Tier | null {
    return this.#tier;
  }

  get tierRule(): string | null {
    return this.#tierRule;
  }

  get selectedPlace(): Place | null {
    return this.#selectedPlace;
  }

  // In the order offered.
  get candidates(): readonly Candidate[] {
    return Object.freeze([...this.#candidates]);
  }

  get approvals(): readonly OpeningHoursApproval[] {
    return Object.freeze([...this.#approvals]);
  }

  get status(): StopStatus {
    if (this.#selectedPlace !== null) {
      return "selected";
    }
    return this.#candidates.length > 0 ? "proposed" : "empty";
  }

  // For a meal. Candidates already offered keep the tier they were offered at.
  setTier(tier: Tier, tierRule: string): void {
    if (this.kind === "attraction") {
      throw new RuleError("An attraction stop has no tier.");
    }
    if (tierRule.trim() === "") {
      throw new RuleError("A stop's tier needs the rule that produced it.");
    }
    this.#tier = tier;
    this.#tierRule = tierRule;
  }

  #selectCandidate(place: Place, visitTimeInMinutes: number): void {
    const candidate = this.#candidateFor(place);
    if (this.#selectedPlace?.id === place.id) {
      return;
    }
    this.#visitTimeInMinutes = checkedVisitTime(visitTimeInMinutes);
    this.#selectedPlace = candidate.place;
    // An opening hours approval was for the old place (domain model 3.7).
    this.#approvals = withoutApproval(this.#approvals, "openingHours");
  }

  // The selected place is one of the candidates, and the stop has a visit time exactly
  // when it has a selected place.
  #refuseBrokenSelection(): void {
    if (this.#selectedPlace === null) {
      if (this.#visitTimeInMinutes !== null) {
        throw noPlaceForVisitTime();
      }
      return;
    }
    this.#candidateFor(this.#selectedPlace);
    checkedVisitTime(this.#visitTimeInMinutes);
  }

  // Places are matched by ID, like everywhere else in the trip.
  #candidateFor(place: Place): Candidate {
    const candidate = this.#candidates.find(
      (each) => each.place.id === place.id,
    );
    if (candidate === undefined) {
      throw new RuleError(
        `${place.name ?? place.id} isn't one of the stop's candidates.`,
      );
    }
    return candidate;
  }

  #clearSelection(): void {
    this.#selectedPlace = null;
    this.#visitTimeInMinutes = null;
    this.#approvals = withoutApproval(this.#approvals, "openingHours");
  }

  // A candidate fits the stop's kind and search area (domain model 3.7).
  #refuseUnfitCandidate(candidate: Candidate): void {
    const name = candidate.place.name ?? candidate.place.id;
    if (
      (candidate.visitTimeInMinutes !== null) !==
      (this.kind === "attraction")
    ) {
      throw new RuleError(
        `${name} doesn't fit the stop: an attraction's candidates each have a visit time, and a meal's have none.`,
      );
    }
    const needsDetour =
      this.searchArea === "alongLeg" && candidate.isFoundByWorker;
    if ((candidate.detourTimeInMinutes !== null) !== needsDetour) {
      throw new RuleError(
        `${name} doesn't fit the stop: a candidate has a detour time exactly when the stop is along the leg and a worker found it.`,
      );
    }
  }
}

// A new stop, with no candidates yet (domain model 3.7, "Creating a stop").
export function newStop(fields: NewStopFields): Stop {
  return new Stop({
    ...fields,
    id: newId("stop"),
    visitTimeInMinutes: null,
    selectedPlace: null,
    candidates: [],
    approvals: [],
  });
}

function refuseBrokenNewStop(fields: NewStopFields): void {
  if (fields.purpose.trim() === "") {
    throw new RuleError("A stop needs a purpose, such as dessert.");
  }
  if ((fields.searchAreaStay !== null) !== (fields.searchArea === "nearStay")) {
    throw new RuleError(
      "A stop near a stay names the stay, and a stop with any other search area names none.",
    );
  }
  const hasTiering = fields.tier !== null || fields.tierRule !== null;
  const isMeal = fields.kind === "meal";
  if (
    hasTiering !== isMeal ||
    (isMeal && (fields.tier === null || !fields.tierRule?.trim()))
  ) {
    throw new RuleError(
      "A meal stop needs a tier and the rule that produced it. An attraction stop has neither.",
    );
  }
}

function checkedVisitTime(value: number | null): number {
  if (value === null || !Number.isInteger(value) || value <= 0) {
    throw new RuleError(
      `A stop with a selected place has a visit time of more than 0 minutes. It was given ${String(value)}.`,
    );
  }
  return value;
}

function noPlaceForVisitTime(): RuleError {
  return new RuleError(
    "A stop has a visit time only when it has a selected place.",
  );
}
