import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import {
  attraction,
  layOut,
  meal,
  OWNER,
  placeNamed,
  PLANNED_AT,
  type Planning,
  planningFor,
} from "../domain/example-trip-parts.fake.js";
import { present, workerOffer } from "../domain/itinerary.fake.js";
import type { Place } from "../domain/place.js";
import { examplePlace } from "../domain/place.fake.js";
import { RejectedPlace } from "../domain/rejected-place.js";
import { newTrip, type Trip } from "../domain/trip.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { findInTripTool } from "./find-in-trip-tool.js";
import { storeTrip, textOf } from "./stored-trip.fake.js";
import type { ToolReply } from "./tool-reply.js";

// What find_in_trip returns, on a small trip built here with the names tool design 2.1
// uses. The example trips' places are made up, so they don't have these names. Most
// places have the example place's facts, so their short line is the same. IDs are
// random, so the lines show each as its prefix, such as "stop_…".

const SHORT = "Barbecue Restaurant, 4.4 stars, $$, Lockhart";

interface SmallTrip {
  trip: Trip;
  places: Record<
    | "desertPearl"
    | "cliffrose"
    | "desertView"
    | "cliffPalace"
    | "roseWell"
    | "savedOnly",
    Place
  >;
}

// A loop from Las Vegas: a night in Springdale, with the Desert Pearl Inn picked as the
// hotel, and also a dinner candidate. Then a night in Cortez, with Desert View
// Watchtower offered along the way, and Cliff Palace picked. Rose Well Camp is
// rejected. A search saved Desert Rose Inn, but it was never offered.
function smallTrip(): SmallTrip {
  const trip = newTrip(OWNER, PLANNED_AT);
  const planning = planningFor(trip);
  const { itinerary, services } = planning;
  const lasVegas = placeNamed("Las Vegas");
  services.itinerary.setStartPlace(itinerary, lasVegas);
  itinerary.endPlace = lasVegas;
  services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 10));
  const places = {
    desertPearl: examplePlace({
      name: "Desert Pearl Inn",
      googlePlaceId: "google-Desert Pearl Inn",
      type: "Hotel",
      rating: 4.8,
      priceLevel: "expensive",
      address: "707 Zion Park Blvd, Springdale, UT 84767, USA",
    }),
    cliffrose: placeNamed("Cliffrose Springdale, Curio Collection by Hilton"),
    desertView: placeNamed("Desert View Watchtower"),
    cliffPalace: placeNamed("Cliff Palace"),
    roseWell: placeNamed("Rose Well Camp"),
    savedOnly: placeNamed("Desert Rose Inn"),
  };
  layOutSpringdale(planning, places);
  layOutCortez(planning, places);
  services.rejections.rejectPlaces(itinerary, [
    new RejectedPlace({
      place: places.roseWell,
      reason: "too far off the route",
    }),
  ]);
  return { trip, places };
}

function layOutSpringdale(
  planning: Planning,
  places: SmallTrip["places"],
): void {
  const { itinerary, services } = planning;
  const springdale = services.stays.addStay(itinerary, {
    place: placeNamed("Springdale"),
    nightCount: 1,
    after: null,
  });
  services.stays.addLodgingCandidates(itinerary, springdale, [
    workerOffer(places.desertPearl),
    workerOffer(places.cliffrose),
  ]);
  springdale.selectCandidate(places.desertPearl);
  const dinner = meal({
    purpose: "dinner",
    searchArea: "nearStay",
    stay: springdale,
  });
  layOut(planning, springdale.days[0], [dinner]);
  services.stops.addCandidates(itinerary, dinner, [
    workerOffer(places.desertPearl),
  ]);
}

function layOutCortez(planning: Planning, places: SmallTrip["places"]): void {
  const { itinerary, services } = planning;
  const cortez = services.stays.addStay(itinerary, {
    place: placeNamed("Cortez"),
    nightCount: 1,
    after: present(itinerary.stays[0]),
  });
  const southRim = attraction({
    purpose: "the east end of the South Rim",
    searchArea: "alongLeg",
  });
  const dwellings = attraction({
    purpose: "cliff dwellings",
    searchArea: "nearStay",
    stay: cortez,
  });
  layOut(planning, cortez.days[0], [southRim, dwellings]);
  services.stops.addCandidates(itinerary, southRim, [
    {
      ...workerOffer(places.desertView),
      tier: null,
      visitTimeInMinutes: 45,
      detourTimeInMinutes: 20,
    },
  ]);
  services.stops.addCandidates(itinerary, dwellings, [
    { ...workerOffer(places.cliffPalace), tier: null, visitTimeInMinutes: 120 },
  ]);
  services.stops.selectCandidate(dwellings, places.cliffPalace);
}

// find_in_trip over the trip, stored with every place it links to, and any others a
// search saved for it.
async function finderFor(
  trip: Trip,
  savedOnly: readonly Place[] = [],
): Promise<(text: string) => Promise<ToolReply>> {
  const fixture = setUp();
  await storeTrip(fixture, trip);
  fixture.store.places.rows.push(
    ...savedOnly.map((place) => ({ tripId: trip.id, place })),
  );
  const tool = findInTripTool({
    ...fixture,
    tripId: trip.id,
    now: () => PLANNED_AT,
  });
  return (text) => tool.handler({ text });
}

function linesOf(reply: ToolReply): string[] {
  return textOf(reply)
    .replace(
      /\b(place|stop|stay)_[a-z2-9]{8}\b/g,
      (id) => `${id.split("_")[0] ?? ""}_…`,
    )
    .split("\n");
}

// The names in the reply, best first.
function namesOf(reply: ToolReply): string[] {
  return linesOf(reply)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2, line.indexOf(" (place_")));
}

describe("find_in_trip", () => {
  it('ranks the Desert Pearl Inn first for "Desert Rose", ahead of Desert View Watchtower and Rose Well Camp, with a line for each spot', async () => {
    const { trip, places } = smallTrip();
    const find = await finderFor(trip, [places.savedOnly]);
    const reply = await find("Desert Rose");
    expect(reply.isError).toBeUndefined();
    expect(linesOf(reply)).toEqual([
      'The 5 places in the trip closest to "Desert Rose", best first:',
      "- Desert Pearl Inn (place_…), Hotel, 4.8 stars, $$$, Springdale.",
      "  - Lodging candidate for Stay 1, Springdale (stay_…), set 1. Selected.",
      '  - Candidate for Day 1, Stop 1 (stop_…), meal: "dinner", set 1. Not selected.',
      `- Desert View Watchtower (place_…), ${SHORT}.`,
      '  - Candidate for Day 2, Stop 1 (stop_…), attraction: "the east end of the South Rim", set 1. Not selected.',
      `- Rose Well Camp (place_…), ${SHORT}.`,
      '  - Rejected for the whole trip: "too far off the route".',
      `- Cliffrose Springdale, Curio Collection by Hilton (place_…), ${SHORT}.`,
      "  - Lodging candidate for Stay 1, Springdale (stay_…), set 1. Not selected.",
      `- Las Vegas (place_…), ${SHORT}.`,
      "  - The start and end place.",
    ]);
  });

  it("gives each ID where it belongs", async () => {
    const { trip, places } = smallTrip();
    const find = await finderFor(trip);
    const text = textOf(await find("Desert Pearl"));
    const springdale = present(trip.itinerary.stays[0]);
    const dinner = present(springdale.days[0]?.stops[0]);
    expect(text).toContain(`- Desert Pearl Inn (${places.desertPearl.id}),`);
    expect(text).toContain(`Stay 1, Springdale (${springdale.id}), set 1.`);
    expect(text).toContain(`Day 1, Stop 1 (${dinner.id}), meal: "dinner"`);
  });

  it('ranks "Cliffrose Springdale, Curio Collection by Hilton" first for "Cliffrose", ahead of Cliff Palace', async () => {
    const { trip } = smallTrip();
    const find = await finderFor(trip);
    const reply = await find("Cliffrose");
    const names = namesOf(reply);
    expect(names[0]).toBe("Cliffrose Springdale, Curio Collection by Hilton");
    expect(names[1]).toBe("Cliff Palace");
    expect(linesOf(reply)).toContain(
      '  - Candidate for Day 2, Stop 2 (stop_…), attraction: "cliff dwellings", set 1. Selected.',
    );
  });

  it('matches the same whatever the case, the punctuation, or a leading "the"', async () => {
    const { trip } = smallTrip();
    const find = await finderFor(trip);
    const plain = linesOf(await find("desert pearl inn")).slice(1);
    for (const text of [
      "DESERT PEARL INN",
      "The Desert Pearl Inn",
      "the desert-pearl, inn!",
    ]) {
      expect(linesOf(await find(text)).slice(1)).toEqual(plain);
    }
  });

  it("gives a stay's town its own line", async () => {
    const { trip } = smallTrip();
    const find = await finderFor(trip);
    const lines = linesOf(await find("Springdale"));
    expect(lines.slice(1, 3)).toEqual([
      `- Springdale (place_…), ${SHORT}.`,
      "  - The town of Stay 1 (stay_…).",
    ]);
  });

  it("returns no place a search saved that was never offered", async () => {
    const { trip, places } = smallTrip();
    const find = await finderFor(trip, [places.savedOnly]);
    const reply = await find("Desert Rose Inn");
    expect(namesOf(reply)).not.toContain("Desert Rose Inn");
    expect(namesOf(reply)).toHaveLength(5);
  });

  it("gives the start and end place a line each when they differ", async () => {
    const trip = newTrip(OWNER, PLANNED_AT);
    const { itinerary, services } = planningFor(trip);
    services.itinerary.setStartPlace(itinerary, placeNamed("Las Vegas"));
    itinerary.endPlace = placeNamed("Salt Lake City");
    const find = await finderFor(trip);
    expect(linesOf(await find("Salt Lake"))).toEqual([
      'The 2 places in the trip closest to "Salt Lake", best first:',
      `- Salt Lake City (place_…), ${SHORT}.`,
      "  - The end place.",
      `- Las Vegas (place_…), ${SHORT}.`,
      "  - The start place.",
    ]);
  });

  it("returns every place when the trip has fewer than 5", async () => {
    const trip = newTrip(OWNER, PLANNED_AT);
    const { itinerary, services } = planningFor(trip);
    services.itinerary.setStartPlace(itinerary, placeNamed("Las Vegas"));
    const find = await finderFor(trip);
    expect(linesOf(await find("Desert Rose"))).toEqual([
      'The 1 place in the trip closest to "Desert Rose":',
      `- Las Vegas (place_…), ${SHORT}.`,
      "  - The start place.",
    ]);
  });

  it("says so, with no error, when the trip has no places", async () => {
    const find = await finderFor(newTrip(OWNER, PLANNED_AT));
    const reply = await find("Desert Rose");
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply)).toBe(
      'The trip has no places yet, so "Desert Rose" isn\'t in it.',
    );
  });

  it("refuses text with no letters or digits", async () => {
    const { trip } = smallTrip();
    const find = await finderFor(trip);
    const reply = await find(" ?! ");
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      'The text has no letters or digits to match. It was given " ?! ".',
    );
  });
});
