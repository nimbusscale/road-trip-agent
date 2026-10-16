import { describe, expect, it } from "vitest";

import { meal, pick, placeNamed, routeDay } from "./example-trip-parts.fake.js";
import {
  checkerFor,
  checksAbout,
  resultOf,
} from "./feasibility-checker.fake.js";
import { present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";

// The Moab trip's planted problems (domain model 5.2), one for each row of the checks
// table they cover (technical spec section 8).

function moab() {
  const example = moabExample();
  const itinerary = example.trip.itinerary;
  const checker = checkerFor(example.trip, example.calendar);
  return { ...example, itinerary, checker };
}

describe("FeasibilityChecker.workOut, on the Moab trip", () => {
  it("gives Fisher Towers 'hours not known', as a note", () => {
    const { itinerary, checker, stops } = moab();
    const result = resultOf(
      checker.workOut(itinerary),
      "openingHoursNotKnown",
      stops.fisherTowers.id,
    );
    expect(result?.level).toBe("note");
    expect(result?.text).toBe(
      "Hours not confirmed for Fisher Towers viewpoint. Check before you go.",
    );
  });

  it("gives Delicate Arch nothing", () => {
    const { itinerary, checker, stops } = moab();
    expect(
      checksAbout(checker.workOut(itinerary), stops.delicateArch.id),
    ).toEqual([]);
  });

  it("gives Milt's 'open, but not long enough', with its closing and arrival times", () => {
    const { itinerary, checker, stops } = moab();
    const results = checker.workOut(itinerary);
    expect(checksAbout(results, stops.milts.id)).toEqual([
      "openingHoursNotLongEnough",
    ]);
    const result = present(
      resultOf(results, "openingHoursNotLongEnough", stops.milts.id),
    );
    expect(result.level).toBe("warning");
    expect(result.isApproved).toBe(false);
    expect(result.hasUnselectedStopBefore).toBe(false);
    expect(result.text).toBe(
      "Milt's closes at 12:30 p.m. You'd get there at 12:00 p.m., with 1 h planned. Times are estimates from average drive times.",
    );
  });

  it("gives Gifford Homestead 'closed for the whole visit'", () => {
    const { itinerary, checker, stops } = moab();
    const results = checker.workOut(itinerary);
    expect(checksAbout(results, stops.gifford.id)).toEqual([
      "openingHoursClosed",
    ]);
    expect(
      resultOf(results, "openingHoursClosed", stops.gifford.id)?.text,
    ).toBe(
      "Gifford Homestead is closed for the whole visit, on Wednesday, October 13, 2027. You'd get there at 1:20 p.m., with 1 h planned. Times are estimates from average drive times.",
    );
  });
});

describe("FeasibilityChecker.compare, on the Moab trip", () => {
  it("gives Day 4 a new driving warning once its driving goes past the 5 hours approved", () => {
    const { itinerary, calendar, checker, torrey } = moab();
    const day4 = present(torrey.days[0]);
    const saved = checker.workOut(itinerary);
    const approved = resultOf(saved, "dailyDriving", day4.id);
    expect(approved?.isApproved).toBe(true);
    expect(approved?.text).toBe(
      "Day 4 needs about 4 h 18 m of driving. You agreed to 5.",
    );
    // 291 minutes of road time, plus the 10% buffer, is about 5 h 21 m.
    routeDay(calendar, itinerary, day4, [104, 77, 18, 22, 70]);
    const comparison = checker.compare(checker.workOut(itinerary), saved);
    const driving = resultOf(comparison.newResults, "dailyDriving", day4.id);
    expect(driving?.isApproved).toBe(false);
    expect(driving?.text).toBe(
      "Day 4 needs about 5 h 21 m of driving. You agreed to 5.",
    );
    expect(checker.isApplying(itinerary, day4, "driveHours")).toBe(false);
  });

  it("returns Milt's warning as new once selecting Love Muffin clears its 'may be too early' mark", () => {
    const planning = moab();
    const { itinerary, calendar, services, checker, stops } = planning;
    const moabStay = planning.moab;
    const day2 = present(moabStay.days[1]);
    // The café stop before Milt's, with no place yet.
    const loveMuffin = present(day2.stops[2]);
    services.stops.removeStops(itinerary, [loveMuffin]);
    const cafe = meal({
      purpose: "café",
      searchArea: "nearStay",
      stay: moabStay,
    });
    services.stops.addStops(itinerary, day2, [cafe], present(day2.stops[1]));
    routeDay(calendar, itinerary, day2, [22, 9, 32, 13, 13, 5]);
    const saved = checker.workOut(itinerary);
    const marked = present(
      resultOf(saved, "openingHoursNotLongEnough", stops.milts.id),
    );
    expect(marked.hasUnselectedStopBefore).toBe(true);
    expect(marked.text).toMatch(
      /An earlier stop on this day has no place picked yet, so this time may be too early\.$/,
    );
    itinerary.replaceCheckResults(saved);

    pick(planning, cafe, placeNamed("Love Muffin Cafe"));
    routeDay(calendar, itinerary, day2, [22, 9, 27, 5, 13, 13, 5]);
    const comparison = checker.compare(
      checker.workOut(itinerary),
      itinerary.checkResults,
    );
    const milts = resultOf(
      comparison.newResults,
      "openingHoursNotLongEnough",
      stops.milts.id,
    );
    expect(milts?.hasUnselectedStopBefore).toBe(false);
    expect(milts?.text).not.toMatch(/may be too early/);
  });
});
