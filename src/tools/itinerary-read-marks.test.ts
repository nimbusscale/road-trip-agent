import { describe, expect, it } from "vitest";

import {
  EXAMPLE_SETTINGS,
  OWNER,
  PLANNED_AT,
  placeNamed,
} from "../domain/example-trip-parts.fake.js";
import { FeasibilityChecker } from "../domain/feasibility-checker.js";
import { fourteenDayExample } from "../domain/fourteen-day-example.fake.js";
import { present, workerOffer } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import { RejectedPlace } from "../domain/rejected-place.js";
import { newTrip } from "../domain/trip.js";
import { TOO_LARGE_ERROR } from "./itinerary-tools.js";
import { readerFor, textOf } from "./stored-trip.fake.js";

// What read_itinerary marks, and when it refuses: candidates offered in sets, check
// results new or already known, approvals that no longer apply, weather text out of
// date, rejected places, bad scopes, and a reply too large to return (tool design 2.1).

const SHORT = "Barbecue Restaurant, 4.4 stars, $$, Lockhart";

describe("read_itinerary's candidates", () => {
  it("gives every candidate's rationale, tier, source, and notes when it reads a stop, and only the selected one's rationale when it reads the day", async () => {
    const { trip, services, stops, moab } = moabExample();
    const [first, second] = [placeNamed("Milt's 2"), placeNamed("Milt's 3")];
    services.stops.addCandidates(trip.itinerary, stops.milts, [
      { ...workerOffer(first), notesText: "Cash only." },
      workerOffer(second),
    ]);
    const read = await readerFor(trip);
    const stopText = textOf(await read(stops.milts.id));
    expect(stopText).toContain(
      `    - Set 2: Milt's 2 (${first.id}), ${SHORT}. Why: "Fits the trip." Offered at tier value, from the rule "the trip default". Found on Google: ${present(first.links[0])} Notes: "Cash only."`,
    );
    expect(stopText).toContain(
      `    - Set 2: Milt's 3 (${second.id}), ${SHORT}. Why: "Fits the trip."`,
    );
    const dayText = textOf(await read(present(moab.days[1]).id));
    expect(dayText).toContain(
      `    - Set 2: Milt's 2 (${first.id}), ${SHORT}.\n`,
    );
    expect(dayText).not.toContain("Cash only.");
  });
});

describe("read_itinerary's marks", () => {
  it("marks a check result already known when the last write saved it, and new when it didn't", async () => {
    const { trip, calendar, moab, stops } = moabExample();
    const checker = new FeasibilityChecker({
      tripBrief: trip.tripBrief,
      settings: EXAMPLE_SETTINGS,
      calendar,
    });
    trip.itinerary.replaceCheckResults(
      checker
        .workOut(trip.itinerary)
        .filter((result) => result.subjectId !== stops.milts.id),
    );
    const read = await readerFor(trip);
    const text = textOf(await read(present(moab.days[1]).id));
    expect(text).toContain(
      "- Already known note: Hours not confirmed for Windows. Check before you go.",
    );
    expect(text).toContain("- New warning: Milt's closes at 12:30 p.m.");
  });

  it("says when an approval no longer applies, and gives its warning as not approved", async () => {
    const { trip, services, torrey } = moabExample();
    const day4 = present(torrey.days[0]);
    services.days.approveDriveHours(day4, 4, "it's a short day otherwise");
    const read = await readerFor(trip);
    const text = textOf(await read(day4.id));
    expect(text).toContain(
      '- Approval: drive hours, up to 4 hours of driving, because "it\'s a short day otherwise". It no longer applies.',
    );
    expect(text).toContain(
      "- New warning: Day 4 needs about 4 h 20 m of driving. You agreed to 4.",
    );
  });

  it("marks a stay's weather text out of date once the stay moves to another town", async () => {
    const { trip, services, moab } = moabExample();
    services.stays.setWeatherText(trip.itinerary, moab, "Layers for sunrise.");
    moab.place = placeNamed("Castle Valley");
    const read = await readerFor(trip);
    expect(textOf(await read(moab.id))).toContain(
      '- Weather and clothing, from seasonal averages, written Thursday, October 15, 2026: "Layers for sunrise." Out of date: the stay\'s place, dates, or activities have changed since it was written.',
    );
  });

  it("lists the trip's rejected places, with the user's reasons, in a whole read", async () => {
    const { trip, services } = moabExample();
    const motel = placeNamed("Kitschy motel");
    services.rejections.rejectPlaces(trip.itinerary, [
      new RejectedPlace({ place: motel, reason: "too kitschy for us" }),
    ]);
    const read = await readerFor(trip);
    expect(textOf(await read("all"))).toContain(
      `Rejected places, for the whole trip:\n- Kitschy motel (${motel.id}), ${SHORT}. Reason: "too kitschy for us"`,
    );
  });

  it("reads a new trip, with nothing set yet", async () => {
    const trip = newTrip(OWNER, PLANNED_AT);
    const read = await readerFor(trip);
    expect(textOf(await read("all")).split("\n")).toEqual([
      "The whole itinerary.",
      "Start place: not set yet.",
      "End place: not set yet.",
      "Start date: not set yet. 1 day. 0 m of road time in all, without the drive buffer.",
      "",
      `Day 1 (${trip.itinerary.lastDay.id}), date not set yet: start or end place not set yet. Last day. Starts 8:00 a.m., the usual start time.`,
      "- No leg.",
      "Schedule: nothing yet.",
      "",
      "Rejected places: none.",
      "",
      "Check results: none.",
    ]);
  });
});

describe("read_itinerary's refusals", () => {
  it.each([
    [
      "a place ID",
      "place_k7m2x9qa",
      /^The scope is "all", or a day, stay, or stop ID\. It was given "place_k7m2x9qa"\.$/,
    ],
    [
      "a day this trip doesn't have",
      "day_k7m2x9qa",
      /^This trip has no day day_k7m2x9qa\.$/,
    ],
    [
      "a stop this trip doesn't have",
      "stop_k7m2x9qa",
      /^This trip has no stop stop_k7m2x9qa\.$/,
    ],
    ["a word other than all", "everything", /^The scope is "all"/],
  ])("refuses %s", async (what, scope, error) => {
    const { trip } = moabExample();
    const read = await readerFor(trip);
    const reply = await read(scope);
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toMatch(error);
  });

  // A 14-day trip with about 300 candidates comes to about 38,000 tokens whole, over
  // the 25,000 that Claude Code returns (tool design 2.1).
  it("refuses a whole read of a 14-day trip as too large, and still reads its days", async () => {
    const { trip } = fourteenDayExample();
    const read = await readerFor(trip);
    const whole = await read("all");
    expect(whole.isError).toBe(true);
    expect(textOf(whole)).toBe(TOO_LARGE_ERROR);
    const day = await read(present(trip.itinerary.days[6]).id);
    expect(day.isError).toBeUndefined();
    expect(textOf(day)).toMatch(
      /^Day 7 \(day_[a-z2-9]{8}\), Saturday, September 18, 2027: Moab\./,
    );
  });
});
