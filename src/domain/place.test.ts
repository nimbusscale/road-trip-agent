import { describe, expect, it } from "vitest";

import { OpeningPeriod } from "./opening-period.js";
import { exampleAddress, examplePlace } from "./place.fake.js";
import { RuleError } from "./rule-error.js";
import { TimeOfDay } from "./time-of-day.js";

const FIVE_P_M = new TimeOfDay(17, 0);
const TWO_A_M = new TimeOfDay(2, 0);

describe("Place.fillName", () => {
  it("fills in the name of a place Google has none for", () => {
    const place = exampleAddress();
    place.fillName("Mike's house");
    expect(place.name).toBe("Mike's house");
  });

  it("keeps the first name given", () => {
    const place = exampleAddress();
    place.fillName("Mike's house");
    place.fillName("The pink house");
    expect(place.name).toBe("Mike's house");
  });

  it("never replaces Google's name", () => {
    const place = examplePlace({ name: "Madonna Inn" });
    place.fillName("the pink hotel");
    expect(place.name).toBe("Madonna Inn");
  });

  it("refuses an empty name", () => {
    expect(() => {
      exampleAddress().fillName("  ");
    }).toThrow(RuleError);
  });
});

describe("Place", () => {
  it("refuses an empty name when created", () => {
    expect(() => examplePlace({ name: "" })).toThrow(RuleError);
  });

  it("allows one period with no closing, for a place that's always open", () => {
    const alwaysOpen = new OpeningPeriod({
      openDay: "sunday",
      openTime: new TimeOfDay(0, 0),
      closeDay: null,
      closeTime: null,
    });
    expect(
      examplePlace({ openingPeriods: [alwaysOpen] }).openingPeriods,
    ).toEqual([alwaysOpen]);
    const overnight = new OpeningPeriod({
      openDay: "monday",
      openTime: FIVE_P_M,
      closeDay: "tuesday",
      closeTime: TWO_A_M,
    });
    expect(() =>
      examplePlace({ openingPeriods: [alwaysOpen, overnight] }),
    ).toThrow(RuleError);
  });

  it("gives copies of its lists that can't be changed", () => {
    const place = examplePlace();
    expect(Object.isFrozen(place.openingPeriods)).toBe(true);
    expect(Object.isFrozen(place.summaries)).toBe(true);
  });
});

describe("Place.shortLine", () => {
  it("gives the type, rating, price level, and town", () => {
    expect(examplePlace().shortLine).toBe(
      "Barbecue Restaurant, 4.4 stars, $$, Lockhart",
    );
    const hotel = examplePlace({
      type: "Hotel",
      rating: 5,
      priceLevel: null,
      address: "605 Davis St, Austin, TX 78701, USA",
    });
    expect(hotel.shortLine).toBe("Hotel, 5.0 stars, Austin");
  });

  it("leaves out the parts that are empty", () => {
    expect(exampleAddress().shortLine).toBe("Lockhart");
    const state = examplePlace({
      type: null,
      rating: null,
      priceLevel: null,
      address: "Texas, USA",
    });
    expect(state.shortLine).toBe("");
  });

  // Seen in a read of the itinerary, as "Delicate Arch Trail, 5.0 stars, Delicate Arch
  // Trail", and "Grand Junction, Grand Junction" for a town.
  it("leaves out a town that's only the place's own name", () => {
    const trail = examplePlace({
      name: "Delicate Arch Trail",
      type: null,
      rating: 5,
      priceLevel: null,
      address: "Delicate Arch Trail, Utah, USA",
    });
    expect(trail.shortLine).toBe("5.0 stars");
    const town = examplePlace({
      name: "Moab",
      type: null,
      rating: null,
      priceLevel: null,
      address: "Moab, UT 84532, USA",
    });
    expect(town.shortLine).toBe("");
  });
});

describe("OpeningPeriod", () => {
  it("refuses a closing day without a closing time", () => {
    expect(
      () =>
        new OpeningPeriod({
          openDay: "monday",
          openTime: FIVE_P_M,
          closeDay: "tuesday",
          closeTime: null,
        }),
    ).toThrow(RuleError);
  });
});
