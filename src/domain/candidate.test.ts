import { describe, expect, it } from "vitest";

import {
  Candidate,
  type CandidateFields,
  newCandidateSet,
} from "./candidate.js";
import { namedPlace, userOffer, workerOffer } from "./itinerary.fake.js";

const HOTEL: CandidateFields = {
  ...workerOffer(namedPlace("Hotel Van Zandt")),
  setNumber: 0,
};

describe("Candidate", () => {
  it("needs a rationale", () => {
    expect(() => new Candidate({ ...HOTEL, rationale: " " })).toThrow(
      "rationale",
    );
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
    expect(() => newCandidateSet([], [])).toThrow("1 to 3");
    const four = ["A", "B", "C", "D"].map((name) =>
      workerOffer(namedPlace(name)),
    );
    expect(() => newCandidateSet([], four)).toThrow("1 to 3");
  });

  it("numbers each set one more than the highest set the holder has", () => {
    const first = newCandidateSet([], [workerOffer(namedPlace("A"))]);
    expect(first.map((each) => each.setNumber)).toEqual([0]);
    const second = newCandidateSet(first, [
      workerOffer(namedPlace("B")),
      workerOffer(namedPlace("C")),
    ]);
    expect(second.map((each) => each.setNumber)).toEqual([1, 1]);
  });

  it("refuses a place the holder already has, or one given twice", () => {
    const place = namedPlace("A");
    const first = newCandidateSet([], [workerOffer(place)]);
    expect(() => newCandidateSet(first, [workerOffer(place)])).toThrow(
      "already one of the candidates",
    );
    expect(() =>
      newCandidateSet([], [workerOffer(place), userOffer(place)]),
    ).toThrow("already one of the candidates");
  });

  it("keeps each offer's own tier", () => {
    const [value, upscale, named] = newCandidateSet(
      [],
      [
        { ...workerOffer(namedPlace("A")), tier: "value" },
        { ...workerOffer(namedPlace("B")), tier: "upscale" },
        userOffer(namedPlace("C")),
      ],
    );
    expect([value?.tier, upscale?.tier, named?.tier]).toEqual([
      "value",
      "upscale",
      null,
    ]);
  });
});
