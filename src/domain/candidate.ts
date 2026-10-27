import type { HowFound } from "./how-found.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import type { Tier } from "./tier.js";

// What a worker or the coordinator passes in for one candidate. The stop or stay that
// adds it fills in its set number (domain model 3.9).
export interface CandidateOffer {
  place: Place;
  rationale: string;
  howFound: HowFound;
  sourceLink: string | null;
  notesText: string | null;
  // What the place is like, judged by the worker that found it.
  tier: Tier | null;
  visitTimeInMinutes: number | null;
  detourTimeInMinutes: number | null;
}

export interface CandidateFields extends CandidateOffer {
  setNumber: number;
}

const MAXIMUM_SET_SIZE = 3;

// One place offered for a stop or a stay's lodging, with the reason (domain model 3.9).
// It never changes. Rules about which candidates fit which holder are on Stop and Stay.
export class Candidate {
  readonly place: Place;
  readonly rationale: string;
  readonly howFound: HowFound;
  readonly sourceLink: string | null;
  readonly notesText: string | null;
  readonly tier: Tier | null;
  readonly visitTimeInMinutes: number | null;
  readonly detourTimeInMinutes: number | null;
  readonly setNumber: number;

  constructor(fields: CandidateFields) {
    refuseBrokenCandidate(fields);
    this.place = fields.place;
    this.rationale = fields.rationale;
    this.howFound = fields.howFound;
    this.sourceLink = fields.sourceLink;
    this.notesText = fields.notesText;
    this.tier = fields.tier;
    this.visitTimeInMinutes = fields.visitTimeInMinutes;
    this.detourTimeInMinutes = fields.detourTimeInMinutes;
    this.setNumber = fields.setNumber;
  }

  // True for one a worker found, and false for a place the user named.
  get isFoundByWorker(): boolean {
    return this.howFound !== "specifiedByUser";
  }
}

// Makes one set of candidates for a stop or stay: 1 to 3, with no place the holder
// already has among its candidates. Each gets the set number, one more than the
// highest the holder still has, or 0 when it has none (domain model 3.9).
export function newCandidateSet(
  candidates: readonly Candidate[],
  offers: readonly CandidateOffer[],
): Candidate[] {
  if (offers.length < 1 || offers.length > MAXIMUM_SET_SIZE) {
    throw new RuleError(
      `A set of candidates holds 1 to ${String(MAXIMUM_SET_SIZE)}. It was given ${String(offers.length)}.`,
    );
  }
  refuseRepeatedPlaces([...candidates, ...offers]);
  const setNumber = Math.max(-1, ...candidates.map((each) => each.setNumber));
  return offers.map(
    (offer) => new Candidate({ ...offer, setNumber: setNumber + 1 }),
  );
}

// A holder has each place among its candidates once, matched by the place's ID.
export function refuseRepeatedPlaces(
  candidates: readonly { place: Place }[],
): void {
  const seen = new Set<string>();
  for (const { place } of candidates) {
    if (seen.has(place.id)) {
      throw new RuleError(
        `${place.name ?? place.id} is already one of the candidates.`,
      );
    }
    seen.add(place.id);
  }
}

function refuseBrokenCandidate(fields: CandidateFields): void {
  const isFoundByWorker = fields.howFound !== "specifiedByUser";
  refuseIf(fields.rationale.trim() === "", "needs a rationale");
  refuseIf(
    isFoundByWorker !== (fields.sourceLink !== null) ||
      fields.sourceLink?.trim() === "",
    "has a source link exactly when a worker found it",
  );
  refuseIf(
    !isFoundByWorker &&
      (fields.tier !== null || fields.detourTimeInMinutes !== null),
    "the user named has no tier and no detour time",
  );
  refuseIf(
    !isWholeAtLeast(fields.visitTimeInMinutes, 1),
    "has a visit time of more than 0 minutes, when it has one",
  );
  refuseIf(
    !isWholeAtLeast(fields.detourTimeInMinutes, 0),
    "has a detour time of 0 minutes or more, when it has one",
  );
  refuseIf(
    !isWholeAtLeast(fields.setNumber, 0),
    "has a set number of 0 or more",
  );
}

function refuseIf(isBroken: boolean, rule: string): void {
  if (isBroken) {
    throw new RuleError(`A candidate ${rule}.`);
  }
}

function isWholeAtLeast(value: number | null, minimum: number): boolean {
  return value === null || (Number.isInteger(value) && value >= minimum);
}
