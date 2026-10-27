import { describe, expect, it } from "vitest";

import { OpeningHoursApproval } from "./approval.js";
import { namedPlace, userOffer, workerOffer } from "./itinerary.fake.js";
import { RuleError } from "./rule-error.js";
import { newStay } from "./stay.js";
import { newStop, type NewStopFields, Stop } from "./stop.js";
import { VIA_SERVICE } from "./via-service.js";

const MOAB = newStay({
  place: namedPlace("Moab"),
  nightCount: 3,
  tier: "midRange",
  tierRule: "2+ nights",
});
const DINNER: NewStopFields = {
  kind: "meal",
  purpose: "burgers and shakes",
  searchArea: "nearStay",
  searchAreaStay: MOAB,
  setTime: null,
  tier: "value",
  tierRule: "the trip default",
};
const HIKE: NewStopFields = {
  ...DINNER,
  kind: "attraction",
  purpose: "a long hike in Arches",
  tier: null,
  tierRule: null,
};
const APPROVAL = new OpeningHoursApproval({
  reason: "we'll eat fast",
  approvedOpenTimeInMinutes: 30,
});

function dinnerWith(...names: string[]): ReturnType<typeof newStop> {
  const stop = newStop(DINNER);
  stop[VIA_SERVICE].addCandidates(
    names.map((name) => workerOffer(namedPlace(name))),
  );
  return stop;
}

function placeOf(stop: ReturnType<typeof newStop>, index: number) {
  const candidate = stop.candidates[index];
  if (candidate === undefined) {
    throw new Error("The stop has no candidate there.");
  }
  return candidate.place;
}

describe("creating a stop", () => {
  it("needs a purpose", () => {
    expect(() => newStop({ ...DINNER, purpose: " " })).toThrow("purpose");
  });

  it("names a stay exactly when it's near a stay", () => {
    expect(() => newStop({ ...DINNER, searchAreaStay: null })).toThrow(
      RuleError,
    );
    expect(() => newStop({ ...DINNER, searchArea: "alongLeg" })).toThrow(
      RuleError,
    );
  });

  it("gives a meal a tier and rule, and an attraction neither", () => {
    expect(() => newStop({ ...DINNER, tier: null })).toThrow("A meal stop");
    expect(() => newStop({ ...DINNER, tierRule: " " })).toThrow("A meal stop");
    expect(() => newStop({ ...HIKE, tier: "posh" })).toThrow("A meal stop");
    expect(newStop(HIKE).status).toBe("empty");
  });
});

describe("Stop.setTier", () => {
  it("sets a meal's tier, and refuses an attraction or an empty rule", () => {
    const dinner = newStop(DINNER);
    dinner.setTier("posh", "last night is special");
    expect([dinner.tier, dinner.tierRule]).toEqual([
      "posh",
      "last night is special",
    ]);
    expect(() => {
      dinner.setTier("value", "");
    }).toThrow(RuleError);
    expect(() => {
      newStop(HIKE).setTier("value", "cheap");
    }).toThrow("Only a meal stop has a tier");
  });
});

describe("a stop's candidates", () => {
  it("get the stop's tier and rule, and make it proposed", () => {
    const dinner = dinnerWith("Milt's");
    expect(dinner.candidates[0]?.tier).toBe("value");
    expect(dinner.status).toBe("proposed");
  });

  it("fit the stop's kind: an attraction's have a visit time, and a meal's none", () => {
    const hike = newStop(HIKE);
    expect(() =>
      hike[VIA_SERVICE].addCandidates([workerOffer(namedPlace("Arches"))]),
    ).toThrow("visit time");
    const timed = {
      ...workerOffer(namedPlace("Milt's")),
      visitTimeInMinutes: 30,
    };
    expect(() => newStop(DINNER)[VIA_SERVICE].addCandidates([timed])).toThrow(
      "visit time",
    );
  });

  it("have a detour time exactly when the stop is along the leg and a worker found it", () => {
    const pie = newStop({
      ...DINNER,
      searchArea: "alongLeg",
      searchAreaStay: null,
    });
    expect(() =>
      pie[VIA_SERVICE].addCandidates([workerOffer(namedPlace("Pie shop"))]),
    ).toThrow("detour time");
    const withDetour = {
      ...workerOffer(namedPlace("Pie shop")),
      detourTimeInMinutes: 12,
    };
    pie[VIA_SERVICE].addCandidates([withDetour]);
    pie[VIA_SERVICE].addCandidates([userOffer(namedPlace("Mom's pies"))]);
    expect(pie.candidates).toHaveLength(2);
    expect(() =>
      newStop(DINNER)[VIA_SERVICE].addCandidates([withDetour]),
    ).toThrow("detour time");
  });

  it("are refused as a whole set when one doesn't fit", () => {
    const dinner = dinnerWith("Milt's");
    const timed = { ...workerOffer(namedPlace("B")), visitTimeInMinutes: 30 };
    expect(() =>
      dinner[VIA_SERVICE].addCandidates([workerOffer(namedPlace("A")), timed]),
    ).toThrow(RuleError);
    expect(dinner.candidates).toHaveLength(1);
  });
});

describe("selecting a stop's place", () => {
  it("takes only one of its candidates", () => {
    expect(() => {
      dinnerWith("Milt's")[VIA_SERVICE].selectCandidate(
        namedPlace("Other"),
        45,
      );
    }).toThrow("isn't one of the stop's candidates");
  });

  it("sets the visit time with it, and makes the stop selected", () => {
    const dinner = dinnerWith("Milt's", "Moab Brewery");
    dinner[VIA_SERVICE].selectCandidate(placeOf(dinner, 1), 45);
    expect(dinner.selectedPlace).toBe(placeOf(dinner, 1));
    expect(dinner.visitTimeInMinutes).toBe(45);
    expect(dinner.status).toBe("selected");
  });

  it("keeps the selection when another set is added", () => {
    const dinner = dinnerWith("Milt's");
    dinner[VIA_SERVICE].selectCandidate(placeOf(dinner, 0), 45);
    dinner[VIA_SERVICE].addCandidates([workerOffer(namedPlace("Other"))]);
    expect(dinner.selectedPlace).toBe(placeOf(dinner, 0));
  });

  it("removes the opening hours approval when the place changes", () => {
    const dinner = dinnerWith("Milt's", "Moab Brewery");
    dinner[VIA_SERVICE].selectCandidate(placeOf(dinner, 0), 45);
    dinner[VIA_SERVICE].setApproval(APPROVAL);
    dinner[VIA_SERVICE].selectCandidate(placeOf(dinner, 0), 45);
    expect(dinner.approvals).toEqual([APPROVAL]);
    dinner[VIA_SERVICE].selectCandidate(placeOf(dinner, 1), 45);
    expect(dinner.approvals).toEqual([]);
  });

  it("is cleared, with the visit time and approval, when its candidate is removed", () => {
    const dinner = dinnerWith("Milt's", "Moab Brewery");
    const milts = placeOf(dinner, 0);
    dinner[VIA_SERVICE].selectCandidate(milts, 45);
    dinner[VIA_SERVICE].setApproval(APPROVAL);
    dinner[VIA_SERVICE].removeCandidate(milts);
    expect([dinner.selectedPlace, dinner.visitTimeInMinutes]).toEqual([
      null,
      null,
    ]);
    expect(dinner.approvals).toEqual([]);
    expect(dinner.status).toBe("proposed");
  });
});

describe("a stop's visit time", () => {
  it("is set only while a place is selected, and is more than 0", () => {
    const dinner = dinnerWith("Milt's");
    expect(() => (dinner.visitTimeInMinutes = 30)).toThrow("selected place");
    dinner[VIA_SERVICE].selectCandidate(placeOf(dinner, 0), 45);
    dinner.visitTimeInMinutes = 30;
    expect(dinner.visitTimeInMinutes).toBe(30);
    expect(() => (dinner.visitTimeInMinutes = 0)).toThrow("more than 0");
    expect(() => (dinner.visitTimeInMinutes = null)).toThrow("more than 0");
  });
});

describe("a stop's approvals", () => {
  it("hold at most one opening hours approval, and no day approvals", () => {
    const dinner = dinnerWith("Milt's");
    dinner[VIA_SERVICE].setApproval(APPROVAL);
    dinner[VIA_SERVICE].setApproval(APPROVAL);
    expect(dinner.approvals).toHaveLength(1);
    expect(() => {
      dinner[VIA_SERVICE].removeApproval("driveHours");
    }).toThrow("Only days hold them");
    dinner[VIA_SERVICE].removeApproval("openingHours");
    expect(dinner.approvals).toEqual([]);
  });
});

describe("a stored stop", () => {
  const stored = {
    ...DINNER,
    id: "stop_k7m2x9qa",
    visitTimeInMinutes: null,
    selectedPlace: null,
    candidates: [],
    approvals: [],
  };

  it("refuses a selected place that isn't one of its candidates", () => {
    expect(
      () =>
        new Stop({
          ...stored,
          selectedPlace: namedPlace("Milt's"),
          visitTimeInMinutes: 45,
        }),
    ).toThrow("isn't one of the stop's candidates");
  });

  it("refuses a visit time with no selected place, or none with one", () => {
    expect(() => new Stop({ ...stored, visitTimeInMinutes: 45 })).toThrow(
      "only when it has a selected place",
    );
    const dinner = dinnerWith("Milt's");
    expect(
      () =>
        new Stop({
          ...stored,
          candidates: dinner.candidates,
          selectedPlace: placeOf(dinner, 0),
        }),
    ).toThrow("visit time");
  });
});
