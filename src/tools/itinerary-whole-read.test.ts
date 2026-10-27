import { describe, expect, it } from "vitest";

import {
  attraction,
  at,
  layOut,
  meal,
  placeNamed,
  planningFor,
  routeDay,
} from "../domain/example-trip-parts.fake.js";
import { present, workerOffer } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import { RejectedPlace } from "../domain/rejected-place.js";
import type { Trip } from "../domain/trip.js";
import { readerFor, textOf } from "./stored-trip.fake.js";

// What a whole read_itinerary gives less of than a scoped read (tool design 2.1): each
// selected place folded into its stop's or lodging line with only its town, the other
// candidates counted by set, and no rationale, weather text, or tier rule. Every place
// in the Moab example has the example place's address, so each town is Lockhart. IDs are
// random, so the lines show each as its prefix, such as "stop_…".

const SHORT = "Barbecue Restaurant, 4.4 stars, $$, Lockhart";

// The Moab example with choices left: more towers on Day 1, one of them picked with a
// detour time; more hotels for Moab; an ice cream stop with candidates and a night sky
// stop with none on Day 3; and Torrey's hotel rejected, with new hotels offered in two
// sets. Moab's weather text is written before the towers change, so it's out of date.
function moabWithChoicesLeft(): Trip {
  const { trip, calendar, services, moab, torrey, stops } = moabExample();
  const { itinerary } = trip;
  services.stays.setWeatherText(itinerary, moab, "Layers for sunrise.");
  const trail = placeNamed("Fisher Towers trail");
  services.stops.addCandidates(itinerary, stops.fisherTowers, [
    { ...workerOffer(trail), visitTimeInMinutes: 90, detourTimeInMinutes: 15 },
    {
      ...workerOffer(placeNamed("Onion Creek")),
      visitTimeInMinutes: 60,
      detourTimeInMinutes: 25,
    },
  ]);
  services.stops.selectCandidate(stops.fisherTowers, trail);
  routeDay(calendar, itinerary, moab.days[0], [0, 100, 27, 2]);
  services.stays.addLodgingCandidates(itinerary, moab, [
    workerOffer(placeNamed("Moab inn")),
    workerOffer(placeNamed("Moab lodge")),
  ]);
  const near = { searchArea: "nearStay", stay: moab } as const;
  const iceCream = meal({
    ...near,
    purpose: "ice cream",
    setTime: at("20:30"),
  });
  const nightSky = attraction({
    ...near,
    purpose: "the night sky",
    setTime: at("22:00"),
  });
  layOut(planningFor(trip), moab.days[2], [iceCream, nightSky]);
  services.stops.addCandidates(itinerary, iceCream, [
    workerOffer(placeNamed("Moab Creamery")),
    workerOffer(placeNamed("Doughbird")),
  ]);
  services.rejections.rejectPlaces(itinerary, [
    new RejectedPlace({
      place: present(torrey.lodging),
      reason: "too far from the park",
    }),
  ]);
  for (const names of [
    ["inn 1", "inn 2", "inn 3"],
    ["lodge 1", "lodge 2"],
  ]) {
    services.stays.addLodgingCandidates(
      itinerary,
      torrey,
      names.map((name) => workerOffer(placeNamed(`Torrey ${name}`))),
    );
  }
  services.stays.setWeatherText(itinerary, torrey, "Cold nights.");
  return trip;
}

async function wholeLinesOf(trip: Trip): Promise<string[]> {
  const read = await readerFor(trip);
  return textOf(await read("all"))
    .replace(
      /\b(place|stop|day|stay)_[a-z2-9]{8}\b/g,
      (id) => `${id.split("_")[0] ?? ""}_…`,
    )
    .split("\n");
}

// The lines from the first one that starts with `head`, up to the next blank line.
function blockOf(lines: readonly string[], head: string): string[] {
  const start = lines.findIndex((line) => line.startsWith(head));
  const end = lines.indexOf("", start);
  return lines.slice(start, end === -1 ? undefined : end);
}

describe("read_itinerary's whole read", () => {
  it("folds the selected lodging into its line, and counts the other candidates, with the weather line marked out of date and no tier rule", async () => {
    const lines = await wholeLinesOf(moabWithChoicesLeft());
    expect(blockOf(lines, "Stay 1 ")).toEqual([
      `Stay 1 (stay_…): Moab (place_…), ${SHORT}. 3 nights, Days 1 to 3, from Sunday, October 10, 2027 to the morning of Wednesday, October 13, 2027.`,
      "- Lodging tier: midRange.",
      "- Lodging: Moab hotel (place_…), Lockhart.",
      "- Other candidates: 2 in set 2.",
      "- Weather and clothing, from seasonal averages, written Thursday, October 15, 2026. Out of date: the stay's place, dates, or activities have changed since it was written.",
    ]);
  });

  it("says a stay has no lodging selected yet, and counts its candidates by set", async () => {
    const lines = await wholeLinesOf(moabWithChoicesLeft());
    expect(blockOf(lines, "Stay 2 ")).toEqual([
      `Stay 2 (stay_…): Torrey (place_…), ${SHORT}. 1 night, Day 4, from Wednesday, October 13, 2027 to the morning of Thursday, October 14, 2027.`,
      "- Lodging tier: value.",
      "- Lodging: none selected yet.",
      "- Lodging candidates: 3 in set 1, 2 in set 2.",
      "- Weather and clothing, from seasonal averages, written Thursday, October 15, 2026.",
    ]);
  });

  it("folds each selected place into its stop line, with its detour time when it has one, and counts only the other candidates", async () => {
    const lines = await wholeLinesOf(moabWithChoicesLeft());
    expect(blockOf(lines, "Day 1 ").slice(2)).toEqual([
      `  - Waypoint: Dewey Bridge (place_…), ${SHORT}. Reason: "steer onto UT-128".`,
      "Schedule:",
      "- 8:00 a.m.: drive.",
      '- 8:00 a.m. to 9:00 a.m.: Stop 1 (stop_…), meal: "breakfast". Near the start place. Tier: value. Selected: Grand Junction café (place_…), Lockhart, visit time 1 h.',
      "- 9:00 a.m. to 10:50 a.m.: drive.",
      '- 10:50 a.m. to 12:20 p.m.: Stop 2 (stop_…), attraction: "towers". Along the leg. Selected: Fisher Towers trail (place_…), Lockhart, detour 15 m when offered, visit time 1 h 30 m.',
      "  - Other candidates: 1 in set 1, 1 in set 2.",
      "- 12:20 p.m. to 5:30 p.m.: free time.",
      "- 5:30 p.m. to 6:00 p.m.: drive.",
      '- 6:00 p.m. to 7:00 p.m.: Stop 3 (stop_…), meal: "local beer". Near the Moab stay. Set time: 6:00 p.m. Tier: value. Selected: Moab Brewery (place_…), Lockhart, visit time 1 h.',
      "- 7:00 p.m. to 7:03 p.m.: drive.",
      "Arrives at Moab hotel at 7:03 p.m.",
    ]);
  });

  it("counts the candidates of a stop with nothing selected, and says when a stop has none", async () => {
    const lines = await wholeLinesOf(moabWithChoicesLeft());
    expect(blockOf(lines, "Day 3 ").slice(2)).toEqual([
      "Schedule:",
      "- 8:00 a.m. to 6:30 p.m.: free time.",
      '- 6:30 p.m. to 7:30 p.m.: Stop 1 (stop_…), meal: "dinner near the hotel". Near the Moab stay. Set time: 6:30 p.m. Tier: value. Selected: The Spoke on Center (place_…), Lockhart, visit time 1 h.',
      '- 8:30 p.m.: Stop 2 (stop_…), meal: "ice cream". Near the Moab stay. Set time: 8:30 p.m. Tier: value. No place selected yet.',
      "  - Candidates: 2 in set 1.",
      '- 10:00 p.m.: Stop 3 (stop_…), attraction: "the night sky". Near the Moab stay. Set time: 10:00 p.m. No candidates yet.',
    ]);
  });

  it("gives no rationale, weather text, or tier rule anywhere", async () => {
    const text = (await wholeLinesOf(moabWithChoicesLeft())).join("\n");
    for (const left of [
      "Why:",
      "Fits the trip.",
      "from the rule",
      "Layers for sunrise.",
      "Cold nights.",
    ]) {
      expect(text).not.toContain(left);
    }
  });
});
