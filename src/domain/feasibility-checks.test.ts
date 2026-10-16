import { describe, expect, it } from "vitest";

import { at, calendarFor, routeDay } from "./example-trip-parts.fake.js";
import {
  checkerFor,
  checksAbout,
  resultOf,
  withBestOrder,
} from "./feasibility-checker.fake.js";
import { present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";
import { TimeOfDay } from "./time-of-day.js";

// The rows of the checks table in technical spec section 8 that the Moab trip doesn't
// plant, and the rules of FeasibilityChecker.compare() and isApplying() (domain model
// 4.8).

function moab() {
  const example = moabExample();
  const itinerary = example.trip.itinerary;
  const checker = checkerFor(example.trip, example.calendar);
  return { ...example, itinerary, checker };
}

describe("the trip and day checks", () => {
  it("warns when the trip length differs from the brief's", () => {
    const { trip, itinerary, services, checker } = moab();
    expect(checksAbout(checker.workOut(itinerary), itinerary.id)).toEqual([]);
    services.tripBrief.setTripLength(trip.tripBrief, 4);
    const result = resultOf(
      checker.workOut(itinerary),
      "tripLengthVsBrief",
      itinerary.id,
    );
    expect(result?.level).toBe("warning");
    expect(result?.text).toBe("The trip is 5 days, and the brief asks for 4.");
  });

  it("skips the trip length and driving checks while the brief has no value for them", () => {
    const { trip, calendar } = sanFranciscoExample();
    const results = checkerFor(trip, calendar).workOut(trip.itinerary);
    expect(results.map((result) => result.check)).not.toContain(
      "tripLengthVsBrief",
    );
    expect(results.map((result) => result.check)).not.toContain("dailyDriving");
  });

  it("warns about a day over the comfortable driving hours, with no approval", () => {
    const { trip, itinerary, services, checker } = moab();
    services.tripBrief.setComfortableDriving(trip.tripBrief, 3);
    const result = resultOf(
      checker.workOut(itinerary),
      "dailyDriving",
      itinerary.lastDay.id,
    );
    expect(result?.isApproved).toBe(false);
    expect(result?.text).toBe(
      "Day 5 needs about 3 h 45 m of driving. Comfortable driving is 3 hours a day.",
    );
  });

  it("counts driving the way the schedule does, each drive rounded up on its own", () => {
    const { itinerary, calendar, checker, moab: moabStay } = moab();
    const day1 = present(moabStay.days[0]);
    // 218 minutes of road time. With the buffer as one figure it would be 240, at the
    // 4-hour limit. Each drive rounded up gives 81 + 81 + 80.
    routeDay(calendar, itinerary, day1, [0, 73, 73, 72]);
    expect(calendar.drivingInMinutesOf(itinerary, day1)).toBe(242);
    expect(
      resultOf(checker.workOut(itinerary), "dailyDriving", day1.id)?.text,
    ).toBe(
      "Day 1 needs about 4 h 2 m of driving. Comfortable driving is 4 hours a day.",
    );
  });

  it("gives a stop-order note only when a different order saves at least the minimum", () => {
    const { itinerary, checker, moab: moabStay } = moab();
    const day2 = present(moabStay.days[1]);
    const selected = [...day2.stops];
    const [first, second, ...rest] = selected;
    const faster = [present(second), present(first), ...rest];
    withBestOrder(day2, { stops: faster, timeSavedInMinutes: 14 });
    expect(checksAbout(checker.workOut(itinerary), day2.id)).toEqual([]);
    withBestOrder(day2, { stops: selected, timeSavedInMinutes: 0 });
    expect(checksAbout(checker.workOut(itinerary), day2.id)).toEqual([]);
    withBestOrder(day2, { stops: faster, timeSavedInMinutes: 25 });
    const result = resultOf(checker.workOut(itinerary), "stopOrder", day2.id);
    expect(result?.level).toBe("note");
    expect(result?.text).toMatch(
      /^On Day 2, a faster order saves about 25 minutes: Windows, then Delicate Arch trail, then Love Muffin Cafe/,
    );
  });
});

describe("the late check", () => {
  it("warns when the party reaches a set time more than the allowance late", () => {
    const { itinerary, checker, moab: moabStay } = moab();
    const day2 = present(moabStay.days[1]);
    const corona = present(day2.stops[4]);
    const dinner = present(day2.stops[5]);
    corona.visitTimeInMinutes = 400;
    const result = resultOf(
      checker.workOut(itinerary),
      "lateForSetTime",
      dinner.id,
    );
    expect(result?.text).toBe(
      "You'd reach dinner out at Desert Bistro at 8:10 p.m., but it's set for 7:00 p.m.",
    );
  });

  it("catches a day that starts too late for its first set time, but not within the allowance", () => {
    const { itinerary, checker, moab: moabStay, stops } = moab();
    const day2 = present(moabStay.days[1]);
    day2.ownStartTime = TimeOfDay.fromText("05:45");
    expect(
      checksAbout(checker.workOut(itinerary), stops.delicateArch.id),
    ).toEqual([]);
    day2.ownStartTime = TimeOfDay.fromText("08:00");
    expect(
      resultOf(
        checker.workOut(itinerary),
        "lateForSetTime",
        stops.delicateArch.id,
      )?.text,
    ).toBe(
      "You'd reach a sunrise hike at Delicate Arch trail at 8:25 a.m., but it's set for 6:00 a.m.",
    );
  });
});

describe("the search area check", () => {
  it("warns about a stop near a stay, or near the start place, moved to a day that doesn't fit it", () => {
    const { itinerary, services, checker, moab: moabStay, stops } = moab();
    const day1 = present(moabStay.days[0]);
    const breakfast = present(day1.stops[0]);
    services.stops.moveStop(itinerary, stops.milts, {
      toDay: itinerary.lastDay,
      after: null,
      setTime: at("12:00"),
    });
    services.stops.moveStop(itinerary, breakfast, {
      toDay: present(moabStay.days[1]),
      after: null,
      setTime: null,
    });
    const results = checker.workOut(itinerary);
    expect(
      resultOf(results, "searchAreaDoesNotFitDay", stops.milts.id)?.text,
    ).toBe(
      "burgers at Milt's is near the Moab stay, but its day no longer starts or ends there.",
    );
    expect(
      resultOf(results, "searchAreaDoesNotFitDay", breakfast.id)?.text,
    ).toBe(
      "breakfast at Grand Junction café is near the start place, but it's no longer on the first day.",
    );
  });
});

describe("the stay checks", () => {
  it("notes a stay with no weather text once another stay has some", () => {
    const { itinerary, services, checker, moab: moabStay, torrey } = moab();
    services.stays.setWeatherText(itinerary, moabStay, "Cool mornings.");
    const results = checker.workOut(itinerary);
    expect(checksAbout(results, moabStay.id)).toEqual([]);
    expect(checksAbout(results, torrey.id)).toEqual(["weatherOutOfDate"]);
  });

  it("notes seasonal averages that could now be a forecast, until the trip starts", () => {
    const { trip, itinerary, services, moab: moabStay } = moab();
    services.stays.setWeatherText(itinerary, moabStay, "Cool mornings.");
    const on = (date: string) =>
      checksAbout(
        checkerFor(
          trip,
          calendarFor(trip, new Date(`${date}T18:00:00Z`)),
        ).workOut(itinerary),
        moabStay.id,
      );
    // Moab's dates run from October 10 to 13, 2027.
    expect(on("2027-10-05")).toEqual([]);
    expect(on("2027-10-06")).toEqual(["forecastNowAvailable"]);
    expect(on("2027-10-10")).toEqual([]);
  });

  it("notes a stay whose nights changed since its tier was set", () => {
    const { itinerary, services, checker, torrey } = moab();
    services.stays.setNightCount(itinerary, torrey, 2);
    expect(
      resultOf(
        checker.workOut(itinerary),
        "stayTierSetForDifferentNights",
        torrey.id,
      )?.text,
    ).toBe("Torrey's nights changed from 1 to 2. Its tier was set for 1.");
    torrey.setTier("value", "the trip default");
    expect(checksAbout(checker.workOut(itinerary), torrey.id)).toEqual([]);
  });
});

describe("FeasibilityChecker.compare", () => {
  it("marks a result with no saved match new, a match already known, and lists what went away", () => {
    const { trip, itinerary, services, checker } = moab();
    const saved = checker.workOut(itinerary);
    services.tripBrief.setTripLength(trip.tripBrief, 4);
    const current = checker.workOut(itinerary);
    const comparison = checker.compare(current, saved);
    expect(comparison.newResults.map((result) => result.check)).toEqual([
      "tripLengthVsBrief",
    ]);
    expect(comparison.knownResults).toHaveLength(saved.length);
    expect(comparison.goneResults).toEqual([]);
    const back = checker.compare(saved, current);
    expect(back.newResults).toEqual([]);
    expect(back.goneResults.map((result) => result.text)).toEqual([
      "The trip is 5 days, and the brief asks for 4.",
    ]);
  });

  it("marks a result that went away and came back new", () => {
    const { trip, itinerary, services, checker } = moab();
    services.tripBrief.setTripLength(trip.tripBrief, 4);
    const withIt = checker.workOut(itinerary);
    services.tripBrief.setTripLength(trip.tripBrief, 5);
    const without = checker.workOut(itinerary);
    expect(checker.compare(without, withIt).goneResults).toHaveLength(1);
    expect(checker.compare(withIt, without).newResults).toHaveLength(1);
  });
});

describe("FeasibilityChecker.isApplying", () => {
  it("applies an opening hours approval while at least its minutes are open", () => {
    const { itinerary, services, checker, stops } = moab();
    expect(checker.isApplying(itinerary, stops.milts, "openingHours")).toBe(
      false,
    );
    services.stops.approveOpeningHours(itinerary, stops.milts, "worth it");
    expect(checker.isApplying(itinerary, stops.milts, "openingHours")).toBe(
      true,
    );
    const saved = checker.workOut(itinerary);
    expect(
      resultOf(saved, "openingHoursNotLongEnough", stops.milts.id)?.isApproved,
    ).toBe(true);
    services.stops.setStopTime(itinerary, stops.milts, at("12:20"));
    expect(checker.isApplying(itinerary, stops.milts, "openingHours")).toBe(
      false,
    );
    const comparison = checker.compare(checker.workOut(itinerary), saved);
    expect(
      resultOf(
        comparison.newResults,
        "openingHoursNotLongEnough",
        stops.milts.id,
      ),
    ).toBeDefined();
  });

  it("always applies a route type approval, and never one the holder doesn't have", () => {
    const { itinerary, services, checker, torrey } = moab();
    const day4 = present(torrey.days[0]);
    expect(checker.isApplying(itinerary, day4, "driveHours")).toBe(true);
    expect(checker.isApplying(itinerary, day4, "routeType")).toBe(false);
    services.days.approveRouteType(day4, "fastest", "to get there early");
    expect(checker.isApplying(itinerary, day4, "routeType")).toBe(true);
    expect(checker.isApplying(itinerary, day4, "openingHours")).toBe(false);
  });
});
