import { describe, expect, it } from "vitest";

import {
  Candidate,
  type CandidateFields,
  newCandidateSet,
} from "./candidate.js";
import { namedPlace, userOffer, workerOffer } from "./itinerary.fake.js";
import { RuleError } from "./rule-error.js";

const MIDRANGE = { tier: "midRange", tierRule: "2+ nights" } as const;
const HOTEL: CandidateFields = {
  ...workerOffer(namedPlace("Hotel Van Zandt")),
  tier: "midRange",
  tierRule: "2+ nights",
  setNumber: 0,
};

describe("Candidate", () => {
  it("needs a rationale", () => {
    expect(() => new Candidate({ ...HOTEL, rationale: " " })).toThrow(
      "rationale",
    );
  });

  it("has a tier and its rule together, or neither", () => {
    expect(() => new Candidate({ ...HOTEL, tierRule: null })).toThrow(
      RuleError,
    );
    expect(
      new Candidate({ ...HOTEL, tier: null, tierRule: null }).tier,
    ).toBeNull();
  });

  it("has a source link exactly when a worker found it", () => {
    expect(() => new Candidate({ ...HOTEL, sourceLink: null })).toThrow(
      "source link",
    );
    expect(
      () =>
        new Candidate({
          ...HOTEL,
          howFound: "specifiedByUser",
          tier: null,
          tierRule: null,
        }),
    ).toThrow("source link");
  });

  it("has no tier or detour time when the user named it", () => {
    const named = { ...HOTEL, howFound: "specifiedByUser", sourceLink: null };
    expect(
      () => new Candidate({ ...named, howFound: "specifiedByUser" }),
    ).toThrow("the user named");
    expect(
      () =>
        new Candidate({
          ...named,
          howFound: "specifiedByUser",
          tier: null,
          tierRule: null,
          detourTimeInMinutes: 5,
        }),
    ).toThrow("the user named");
  });

  it("has a visit time of more than 0, and a detour time of 0 or more", () => {
    expect(() => new Candidate({ ...HOTEL, visitTimeInMinutes: 0 })).toThrow(
      "visit time",
    );
    expect(
      new Candidate({ ...HOTEL, detourTimeInMinutes: 0 }).detourTimeInMinutes,
    ).toBe(0);
    expect(() => new Candidate({ ...HOTEL, detourTimeInMinutes: -1 })).toThrow(
      "detour time",
    );
  });
});

describe("newCandidateSet", () => {
  it("holds 1 to 3 candidates", () => {
    expect(() => newCandidateSet([], [], MIDRANGE)).toThrow("1 to 3");
    const four = ["A", "B", "C", "D"].map((name) =>
      workerOffer(namedPlace(name)),
    );
    expect(() => newCandidateSet([], four, MIDRANGE)).toThrow("1 to 3");
  });

  it("numbers each set one more than the highest set the holder has", () => {
    const first = newCandidateSet([], [workerOffer(namedPlace("A"))], MIDRANGE);
    expect(first.map((each) => each.setNumber)).toEqual([0]);
    const second = newCandidateSet(
      first,
      [workerOffer(namedPlace("B")), workerOffer(namedPlace("C"))],
      MIDRANGE,
    );
    expect(second.map((each) => each.setNumber)).toEqual([1, 1]);
  });

  it("refuses a place the holder already has, or one given twice", () => {
    const place = namedPlace("A");
    const first = newCandidateSet([], [workerOffer(place)], MIDRANGE);
    expect(() =>
      newCandidateSet(first, [workerOffer(place)], MIDRANGE),
    ).toThrow("already one of the candidates");
    expect(() =>
      newCandidateSet([], [workerOffer(place), userOffer(place)], MIDRANGE),
    ).toThrow("already one of the candidates");
  });

  it("gives the holder's tier and rule to one a worker found, and none to one the user named", () => {
    const [found, named] = newCandidateSet(
      [],
      [workerOffer(namedPlace("A")), userOffer(namedPlace("B"))],
      MIDRANGE,
    );
    expect([found?.tier, found?.tierRule]).toEqual(["midRange", "2+ nights"]);
    expect([named?.tier, named?.tierRule]).toEqual([null, null]);
  });
});
