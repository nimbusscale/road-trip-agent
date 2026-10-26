import { describe, expect, it } from "vitest";

import { CalendarDate } from "./calendar-date.js";
import {
  namedPlace,
  present,
  userOffer,
  workerOffer,
} from "./itinerary.fake.js";
import { RuleError } from "./rule-error.js";
import { newStay, type NewStayFields, Stay } from "./stay.js";
import { VIA_SERVICE } from "./via-service.js";
import { WeatherText } from "./weather-text.js";

const MOAB_FIELDS: NewStayFields = {
  place: namedPlace("Moab"),
  nightCount: 3,
  tier: "midRange",
  tierRule: "stays of 2+ nights",
};

function moabWith(...names: string[]): Stay {
  const stay = newStay(MOAB_FIELDS);
  stay[VIA_SERVICE].addLodgingCandidates(
    names.map((name) => workerOffer(namedPlace(name))),
  );
  return stay;
}

describe("creating a stay", () => {
  it("creates one day for each night, none of them rest days", () => {
    const moab = newStay(MOAB_FIELDS);
    expect(moab.nightCount).toBe(3);
    expect(moab.days.map((day) => day.isRestDay)).toEqual([
      false,
      false,
      false,
    ]);
    expect(new Set(moab.days.map((day) => day.id)).size).toBe(3);
  });

  it("refuses fewer than 1 night, or an empty rule", () => {
    expect(() => newStay({ ...MOAB_FIELDS, nightCount: 0 })).toThrow(
      "at least 1",
    );
    expect(() => newStay({ ...MOAB_FIELDS, tierRule: " " })).toThrow(RuleError);
    const moab = newStay(MOAB_FIELDS);
    expect(() => new Stay({ ...storedFieldsOf(moab), days: [] })).toThrow(
      "at least one day",
    );
  });

  it("sleeps in its town until lodging is selected", () => {
    const moab = moabWith("Moab hotel");
    expect(moab.sleepsAt).toBe(MOAB_FIELDS.place);
    const hotel = present(moab.lodgingCandidates[0]).place;
    moab.selectCandidate(hotel);
    expect(moab.sleepsAt).toBe(hotel);
  });
});

describe("Stay.setTier", () => {
  it("sets the tier and its rule, and refuses an empty rule", () => {
    const moab = newStay(MOAB_FIELDS);
    moab.setTier("value", "one-night stays");
    expect([moab.tier, moab.tierRule]).toEqual(["value", "one-night stays"]);
    expect(() => {
      moab.setTier("posh", "");
    }).toThrow(RuleError);
  });
});

describe("Stay.selectCandidate", () => {
  it("takes only one of the stay's candidates", () => {
    expect(() => {
      moabWith("Moab hotel").selectCandidate(namedPlace("Elsewhere"));
    }).toThrow("isn't one of the stay's lodging candidates");
  });

  it("sets the stay's tier to a candidate offered at another tier", () => {
    const moab = moabWith("Moab hotel");
    moab.setTier("posh", "last night is special");
    moab.selectCandidate(present(moab.lodgingCandidates[0]).place);
    expect([moab.tier, moab.tierRule]).toEqual([
      "midRange",
      "the user picked a mid-range option",
    ]);
  });

  it("keeps the stay's tier for a place the user named", () => {
    const moab = newStay(MOAB_FIELDS);
    const [friends] = moab[VIA_SERVICE].addLodgingCandidates([
      userOffer(namedPlace("A friend's house")),
    ]);
    moab.selectCandidate(present(friends).place);
    expect(moab.tierRule).toBe("stays of 2+ nights");
  });
});

describe("a stay's lodging candidates", () => {
  it("hold 1 to 3 per set, with no place twice", () => {
    expect(() => moabWith("A", "B", "C", "D")).toThrow("1 to 3");
    const moab = moabWith("A");
    const placeA = present(moab.lodgingCandidates[0]).place;
    expect(() =>
      moab[VIA_SERVICE].addLodgingCandidates([workerOffer(placeA)]),
    ).toThrow("already one of the candidates");
  });

  it("have no visit time or detour time", () => {
    const timed = { ...workerOffer(namedPlace("A")), visitTimeInMinutes: 60 };
    expect(() =>
      newStay(MOAB_FIELDS)[VIA_SERVICE].addLodgingCandidates([timed]),
    ).toThrow("no visit time or detour time");
  });

  it("clear the lodging when its candidate is removed", () => {
    const moab = moabWith("Moab hotel", "Other hotel");
    const [hotel, other] = moab.lodgingCandidates.map((each) => each.place);
    moab.selectCandidate(present(hotel));
    moab[VIA_SERVICE].removeLodgingCandidate(present(other));
    expect(moab.lodging).toBe(hotel);
    moab[VIA_SERVICE].removeLodgingCandidate(present(hotel));
    expect(moab.lodging).toBeNull();
    expect(moab.lodgingCandidates).toEqual([]);
  });

  it("refuse a stored lodging that isn't one of them", () => {
    const moab = moabWith("Moab hotel");
    expect(
      () =>
        new Stay({ ...storedFieldsOf(moab), lodging: namedPlace("Elsewhere") }),
    ).toThrow(RuleError);
  });
});

describe("a stay's nights", () => {
  it("add days at the end, and remove them from the end", () => {
    const moab = newStay(MOAB_FIELDS);
    const [first, second] = moab.days;
    const added = moab[VIA_SERVICE].setNightCount(4);
    expect(added).toHaveLength(1);
    expect(moab.days.at(-1)).toBe(added[0]);
    expect(moab[VIA_SERVICE].setNightCount(2)).toEqual([]);
    expect(moab.days).toEqual([first, second]);
    expect(() => moab[VIA_SERVICE].setNightCount(0)).toThrow("at least 1");
  });
});

describe("a stay's weather text", () => {
  it("is replaced whole, and refuses empty guidance", () => {
    const moab = newStay(MOAB_FIELDS);
    const fields = {
      guidance: "Layers for the sunrise hike.",
      label: "forecast",
      writtenOnDate: new CalendarDate(2027, 10, 5),
      writtenForPlace: moab.place,
      writtenForDates: [],
      writtenForActivities: [],
    } as const;
    const text = new WeatherText(fields);
    moab[VIA_SERVICE].setWeatherText(text);
    expect(moab.weatherText).toBe(text);
    expect(() => new WeatherText({ ...fields, guidance: " " })).toThrow(
      "guidance",
    );
  });
});

describe("a stay's lists", () => {
  it("are copies that can't be changed", () => {
    const moab = moabWith("Moab hotel");
    expect(Object.isFrozen(moab.days)).toBe(true);
    expect(Object.isFrozen(moab.lodgingCandidates)).toBe(true);
  });
});

function storedFieldsOf(stay: Stay): ConstructorParameters<typeof Stay>[0] {
  return {
    id: stay.id,
    place: stay.place,
    lodging: stay.lodging,
    lodgingCandidates: stay.lodgingCandidates,
    tier: stay.tier,
    tierRule: stay.tierRule,
    days: stay.days,
    weatherText: stay.weatherText,
  };
}
