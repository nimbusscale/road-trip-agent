import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import { sanFranciscoExample } from "../domain/san-francisco-example.fake.js";
import { readerFor, textOf } from "./stored-trip.fake.js";
import type { ToolReply } from "./tool-reply.js";

// What each scope of read_itinerary returns, on the example trips (domain model section
// 5). Their places all have the facts of the example place, so each short line is the
// same. IDs are random, so the lines show each as its prefix, such as "stop_…". The
// tests below the first check that the right IDs are in place.

const SHORT = "Barbecue Restaurant, 4.4 stars, $$, Lockhart";

function linesOf(reply: ToolReply): string[] {
  return textOf(reply)
    .replace(
      /\b(place|stop|day|stay)_[a-z2-9]{8}\b/g,
      (id) => `${id.split("_")[0] ?? ""}_…`,
    )
    .split("\n");
}

function picked(name: string, visit: string | null): string {
  const visitText = visit === null ? "" : `, visit time ${visit}`;
  return `    - Set 1: ${name} (place_…), ${SHORT}${visitText}, selected. Why: "The user's pick."`;
}

describe("read_itinerary on the Moab trip", () => {
  it("reads Day 2: its leg, its schedule in time order, each stop with its candidates, and its check results", async () => {
    const { trip, moab } = moabExample();
    const read = await readerFor(trip);
    const reply = await read(present(moab.days[1]).id);
    expect(reply.isError).toBeUndefined();
    expect(linesOf(reply)).toEqual([
      "Day 2 (day_…), Monday, October 11, 2027: Moab. Starts 5:30 a.m., the day's own start time.",
      "- Leg: 100 miles, 1 h 34 m of road time, 1 h 47 m of driving with the drive buffer.",
      "Schedule:",
      "- 5:30 a.m. to 5:55 a.m.: drive.",
      "- 5:55 a.m. to 6:00 a.m.: free time.",
      '- 6:00 a.m. to 8:40 a.m.: Stop 1 (stop_…), attraction: "a sunrise hike". Near the Moab stay. Set time: 6:00 a.m. Selected: Delicate Arch trail (place_…), visit time 2 h 40 m.',
      "  - Candidates:",
      picked("Delicate Arch trail", "2 h 40 m"),
      "- 8:40 a.m. to 8:50 a.m.: drive.",
      '- 8:50 a.m. to 9:50 a.m.: Stop 2 (stop_…), attraction: "arches". Near the Moab stay. Selected: Windows (place_…), visit time 1 h.',
      "  - Candidates:",
      picked("Windows", "1 h"),
      "- 9:50 a.m. to 10:20 a.m.: drive.",
      '- 10:20 a.m. to 11:20 a.m.: Stop 3 (stop_…), meal: "café". Near the Moab stay. Tier: value, from the rule "the trip default". Selected: Love Muffin Cafe (place_…), visit time 1 h.',
      "  - Candidates:",
      picked("Love Muffin Cafe", null),
      "- 11:20 a.m. to 11:54 a.m.: free time.",
      "- 11:54 a.m. to 12:00 p.m.: drive.",
      '- 12:00 p.m. to 1:00 p.m.: Stop 4 (stop_…), meal: "burgers". Near the Moab stay. Set time: 12:00 p.m. Tier: value, from the rule "the trip default". Selected: Milt\'s (place_…), visit time 1 h.',
      "  - Candidates:",
      picked("Milt's", null),
      "- 1:00 p.m. to 1:15 p.m.: drive.",
      '- 1:15 p.m. to 3:45 p.m.: Stop 5 (stop_…), attraction: "a hike". Near the Moab stay. Selected: Corona Arch (place_…), visit time 2 h 30 m.',
      "  - Candidates:",
      picked("Corona Arch", "2 h 30 m"),
      "- 3:45 p.m. to 6:45 p.m.: free time.",
      "- 6:45 p.m. to 7:00 p.m.: drive.",
      '- 7:00 p.m. to 8:00 p.m.: Stop 6 (stop_…), meal: "dinner out". Near the Moab stay. Set time: 7:00 p.m. Tier: value, from the rule "the trip default". Selected: Desert Bistro (place_…), visit time 1 h.',
      "  - Candidates:",
      picked("Desert Bistro", null),
      "- 8:00 p.m. to 8:06 p.m.: drive.",
      "Arrives at Moab hotel at 8:06 p.m.",
      "",
      "Check results:",
      "- New note: Hours not confirmed for Windows. Check before you go.",
      "- New note: Hours not confirmed for Love Muffin Cafe. Check before you go.",
      "- New warning: Milt's closes at 12:30 p.m. You'd get there at 12:00 p.m., with 1 h planned. Times are estimates from average drive times.",
      "- New note: Hours not confirmed for Corona Arch. Check before you go.",
      "- New note: Hours not confirmed for Desert Bistro. Check before you go.",
    ]);
  });

  it("gives each ID where it belongs", async () => {
    const { trip, moab, stops } = moabExample();
    const read = await readerFor(trip);
    const day2 = present(moab.days[1]);
    const text = textOf(await read(day2.id));
    const miltsPlace = present(stops.milts.selectedPlace);
    expect(text).toContain(`Day 2 (${day2.id}),`);
    expect(text).toContain(
      `Stop 4 (${stops.milts.id}), meal: "burgers". Near the Moab stay. Set time: 12:00 p.m. Tier: value, from the rule "the trip default". Selected: Milt's (${miltsPlace.id}),`,
    );
    expect(text).toContain(`Set 1: Milt's (${miltsPlace.id}), ${SHORT},`);
  });

  it("reads the Torrey stay: its lodging, its day with the drive hours approval, and the stargazing stop after midnight", async () => {
    const { trip, torrey } = moabExample();
    const read = await readerFor(trip);
    const lines = linesOf(await read(torrey.id));
    expect(lines.slice(0, 6)).toEqual([
      `Stay 2 (stay_…): Torrey (place_…), ${SHORT}. 1 night, Day 4, from Wednesday, October 13, 2027 to the morning of Thursday, October 14, 2027.`,
      '- Lodging tier: value, from the rule "the trip default".',
      "- Lodging: Torrey hotel (place_…).",
      "- Lodging candidates:",
      `  - Set 1: Torrey hotel (place_…), ${SHORT}, selected. Why: "The user's pick." Named by the user.`,
      "- Weather and clothing: none yet.",
    ]);
    expect(lines).toContain(
      '- Approval: drive hours, up to 5 hours of driving, because "we want to see the hoodoos and Capitol Reef on the way". It applies.',
    );
    expect(lines).toContain(
      '- 1:00 a.m. the next day to 2:00 a.m. the next day: Stop 4 (stop_…), attraction: "stargazing". Near the Torrey stay. Set time: 1:00 a.m. the next day. Selected: Panorama Point (place_…), visit time 1 h.',
    );
    expect(lines).toContain(
      "Arrives at Torrey hotel at 2:15 a.m. the next day.",
    );
    expect(lines.slice(lines.indexOf("Check results:"))).toEqual([
      "Check results:",
      "- New warning, approved: Day 4 needs about 4 h 20 m of driving. You agreed to 5.",
      "- New note: Hours not confirmed for Goblin Valley State Park. Check before you go.",
      "- New warning: Gifford Homestead is closed for the whole visit, on Wednesday, October 13, 2027. You'd get there at 1:20 p.m., with 1 h planned. Times are estimates from average drive times.",
      "- New note: Hours not confirmed for Capitol Gorge. Check before you go.",
      "- New note: Hours not confirmed for Panorama Point. Check before you go.",
    ]);
  });

  it("reads Milt's: the stop under its day's line, every candidate with how it was found, and its check result", async () => {
    const { trip, stops } = moabExample();
    const read = await readerFor(trip);
    expect(linesOf(await read(stops.milts.id))).toEqual([
      "Day 2 (day_…), Monday, October 11, 2027: Moab. Starts 5:30 a.m., the day's own start time.",
      '- 12:00 p.m. to 1:00 p.m.: Stop 4 (stop_…), meal: "burgers". Near the Moab stay. Set time: 12:00 p.m. Tier: value, from the rule "the trip default". Selected: Milt\'s (place_…), visit time 1 h.',
      "  - Candidates:",
      `    - Set 1: Milt's (place_…), ${SHORT}, selected. Why: "The user's pick." Named by the user.`,
      "",
      "Check results:",
      "- New warning: Milt's closes at 12:30 p.m. You'd get there at 12:00 p.m., with 1 h planned. Times are estimates from average drive times.",
    ]);
  });

  it("reads the whole trip: its ends and dates, each stay and its days in order, the last day, and every check result", async () => {
    const { trip } = moabExample();
    const read = await readerFor(trip);
    const lines = linesOf(await read("all"));
    expect(lines.slice(0, 4)).toEqual([
      "The whole itinerary.",
      `Start place: Grand Junction (place_…), ${SHORT}.`,
      `End place: Salt Lake City (place_…), ${SHORT}.`,
      "Start date: Sunday, October 10, 2027. 5 days, to Thursday, October 14, 2027. 11 h 1 m of road time in all, without the drive buffer.",
    ]);
    expect(
      lines.filter((line) => /^(Stay|Day) \d/.test(line)).map(headOf),
    ).toEqual([
      "Stay 1 (stay_…): Moab",
      "Day 1 (day_…), Sunday, October 10, 2027: Grand Junction → Moab",
      "Day 2 (day_…), Monday, October 11, 2027: Moab",
      "Day 3 (day_…), Tuesday, October 12, 2027: Moab. Rest day",
      "Stay 2 (stay_…): Torrey",
      "Day 4 (day_…), Wednesday, October 13, 2027: Moab → Torrey",
      "Day 5 (day_…), Thursday, October 14, 2027: Torrey → Salt Lake City. Last day",
    ]);
    expect(lines).toContain(
      `- Leg: 100 miles, 2 h 9 m of road time, 2 h 23 m of driving with the drive buffer. Waypoints: Dewey Bridge (place_…), ${SHORT}.`,
    );
    expect(lines).toContain("Rejected places: none.");
    const results = lines.slice(lines.indexOf("Check results:") + 1);
    expect(results).toHaveLength(14);
    expect(results).toContain(
      "- New note: Hours not confirmed for Fisher Towers viewpoint. Check before you go.",
    );
  });
});

// Up to the first period, such as "Day 3 (day_…), Tuesday, October 12, 2027: Moab".
function headOf(line: string): string {
  const [head = "", ...marks] = line.split(". ");
  return [head, ...marks.filter((mark) => /^(Rest|Last) day/.test(mark))]
    .join(". ")
    .replace(/\.$/, "")
    .replace(/, \d+ nights?.*$/, "")
    .replace(/ \(place_….*$/, "");
}

describe("read_itinerary on the San Francisco trip", () => {
  it("reads the Monterey stay with the breakfast near it on Day 2, which belongs to the next stay", async () => {
    const { trip, monterey } = sanFranciscoExample();
    const read = await readerFor(trip);
    const lines = linesOf(await read(monterey.id));
    const elsewhere = lines.indexOf(
      "Stops on other days whose search area is this stay:",
    );
    expect(lines.slice(elsewhere, elsewhere + 5)).toEqual([
      "Stops on other days whose search area is this stay:",
      "Day 2 (day_…):",
      '- 8:10 a.m. to 9:10 a.m.: Stop 1 (stop_…), meal: "breakfast before the drive". Near the Monterey stay. Tier: value, from the rule "the trip default". Selected: First Awakenings, Monterey (place_…), visit time 1 h.',
      "  - Candidates:",
      `    - Set 1: First Awakenings, Monterey (place_…), ${SHORT}, selected. Why: "The user's pick." Named by the user.`,
    ]);
    expect(lines).toContain(
      "- New note: Hours not confirmed for First Awakenings, Monterey. Check before you go.",
    );
    expect(lines).not.toContain(
      "Day 2 (day_…), Friday, May 14, 2027: Monterey → San Luis Obispo. Starts 8:00 a.m., the usual start time.",
    );
  });

  it("reads the last day, with its route type approval and its arrival at the end place", async () => {
    const { trip } = sanFranciscoExample();
    const read = await readerFor(trip);
    expect(linesOf(await read(trip.itinerary.lastDay.id))).toEqual([
      "Day 3 (day_…), Saturday, May 15, 2027: San Luis Obispo → Mike's house. Last day. Starts 8:00 a.m., the usual start time.",
      "- Leg: 100 miles, 3 h 38 m of road time, 4 h of driving with the drive buffer.",
      '- Approval: route type fastest, because "we want to get to LA quickly". It applies.',
      "Schedule:",
      "- 8:00 a.m. to 12:00 p.m.: drive.",
      "Arrives at Mike's house at 12:00 p.m.",
      "",
      "Check results: none.",
    ]);
  });
});
