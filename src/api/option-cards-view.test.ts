import { describe, expect, it } from "vitest";

import { TEST_USER_ID } from "../auth/test-tokens.js";
import type { CandidateOffer } from "../domain/candidate.js";
import { EXAMPLE_SETTINGS } from "../domain/example-trip-parts.fake.js";
import {
  exampleMoabTrip,
  namedPlace,
  userOffer,
  workerOffer,
} from "../domain/itinerary.fake.js";
import type { Tier } from "../domain/tier.js";
import { calendarAndServicesFor } from "../domain/trip-services.js";
import type {
  ItineraryResponse,
  ShownChoice,
  ShownDay,
} from "../shared/itinerary.schema.js";
import { itineraryViewOf } from "./itinerary-view.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");

function dayNumbered(view: ItineraryResponse, number: number): ShownDay {
  const day = view.days.find((each) => each.number === number);
  if (day === undefined) {
    throw new Error(`The view has no Day ${String(number)}.`);
  }
  return day;
}

describe("the itinerary view's option cards", () => {
  function moabPlanning() {
    const example = exampleMoabTrip({ id: TEST_USER_ID });
    const { trip } = example;
    const { calendar, services } = calendarAndServicesFor(
      trip,
      EXAMPLE_SETTINGS,
      () => PLANNING,
    );
    const view = () => itineraryViewOf(trip, calendar);
    return { ...example, itinerary: trip.itinerary, services, view };
  }

  function offer(name: string, tier: Tier | null): CandidateOffer {
    return { ...workerOffer(namedPlace(name)), tier };
  }

  // Moab Day 3's only stop: "dinner near the hotel".
  function restDayDinner(view: ItineraryResponse): ShownChoice | undefined {
    return dayNumbered(view, 3).schedule[0]?.stop?.choice;
  }

  it("shows the newest set of a stop with nothing selected, each option with Google's facts and ours", () => {
    const { itinerary, moab, services, view } = moabPlanning();
    const dinner = moab.days[2]?.stops[0];
    if (dinner === undefined) {
      throw new Error("Moab Day 3 has no stop.");
    }
    services.stops.addCandidates(itinerary, dinner, [
      offer("Desert Bistro", "upscale"),
    ]);
    services.stops.addCandidates(itinerary, dinner, [
      { ...offer("The Spoke on Center", "midRange"), notesText: "Busy at 7." },
      offer("Antica Forma", "value"),
      { ...userOffer(namedPlace("Mike's grill")), visitTimeInMinutes: null },
    ]);
    const choice = restDayDinner(view());
    expect(choice).toMatchObject({ status: "proposed", candidateCount: 4 });
    const options = choice?.card?.options ?? [];
    expect(options).toMatchObject([
      {
        place: { name: "The Spoke on Center" },
        type: "Barbecue Restaurant",
        location: "Lockhart",
        rating: "4.4 stars, 3,697 reviews",
        tier: "Mid-range",
        namedByUser: false,
        rationale: "Fits the trip.",
        notes: "Busy at 7.",
        visitTime: null,
        detourTime: null,
      },
      { place: { name: "Antica Forma" }, tier: "Value", notes: null },
      { tier: "Your choice", namedByUser: true, sourceLink: null },
    ]);
    expect(options[0]?.sourceLink).toMatch(/^https:/);
    expect(choice?.card).toMatchObject({ higherTier: true, lowerTier: true });
  });

  it("hides Higher tier when every option is upscale, and Lower tier when every option is value", () => {
    const { itinerary, moab, services, view } = moabPlanning();
    const dinner = moab.days[2]?.stops[0];
    const torrey = itinerary.stays[1];
    if (dinner === undefined || torrey === undefined) {
      throw new Error("The Moab trip is missing Day 3's dinner or Torrey.");
    }
    services.stops.addCandidates(itinerary, dinner, [
      offer("Desert Bistro", "upscale"),
      offer("Sunset Grill", "upscale"),
    ]);
    services.stays.addLodgingCandidates(itinerary, torrey, [
      offer("Capitol Reef Inn", "value"),
    ]);
    const shown = view();
    expect(restDayDinner(shown)?.card).toMatchObject({
      higherTier: false,
      lowerTier: true,
    });
    expect(shown.stays[1]?.lodging.card).toMatchObject({
      options: [{ place: { name: "Capitol Reef Inn" }, tier: "Value" }],
      higherTier: true,
      lowerTier: false,
    });
  });

  it("gives an attraction's options no tier and no tier actions, with the visit time", () => {
    const { itinerary, moab, services, view } = moabPlanning();
    const sunrise = moab.days[1]?.stops[0];
    if (sunrise === undefined) {
      throw new Error("Moab Day 2 has no stop.");
    }
    services.stops.addCandidates(itinerary, sunrise, [
      {
        ...offer("Delicate Arch Trail", null),
        visitTimeInMinutes: 150,
      },
    ]);
    const entry = dayNumbered(view(), 2).schedule.find(
      (each) => each.stop?.id === sunrise.id,
    );
    expect(entry?.stop?.choice.card).toMatchObject({
      options: [{ tier: null, visitTime: "2 h 30 m", detourTime: null }],
      higherTier: false,
      lowerTier: false,
    });
  });

  // Functional spec 7.5: the coordinator names the new options in chat instead.
  it("shows no card for new options on a stop that already has a pick, and none for a stop with no options", () => {
    const { itinerary, milts, services, view } = moabPlanning();
    services.stops.addCandidates(itinerary, milts, [
      offer("Moab Diner", "value"),
    ]);
    const shown = view();
    const entry = dayNumbered(shown, 2).schedule.find(
      (each) => each.stop?.id === milts.id,
    );
    expect(entry?.stop?.choice).toMatchObject({
      status: "selected",
      candidateCount: 2,
      card: null,
    });
    expect(restDayDinner(shown)).toMatchObject({ status: "empty", card: null });
  });
});
