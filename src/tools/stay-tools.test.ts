import { describe, expect, it } from "vitest";

import { placeNamed } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import { exampleAddress } from "../domain/place.fake.js";
import { newMoabTrip, plannedMoab, withEnds } from "./skeleton-tools.fake.js";
import { textOf } from "./stored-trip.fake.js";

describe("update_itinerary", () => {
  it("sets the start place, end place, and start date in one call, start place first", async () => {
    const trip = await newMoabTrip();
    const reply = await trip.updateItinerary({
      startPlace: {
        placeId: trip.place("Grand Junction").id,
        name: "Grand Junction",
      },
      endPlace: {
        placeId: trip.place("Salt Lake City").id,
        name: "Salt Lake City",
      },
      startDate: "2027-10-10",
    });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply)).toMatch(
      /^Changed the itinerary\.\nRoad time changed/,
    );
    const whole = await trip.read("all");
    expect(whole).toContain("Start place: Grand Junction");
    expect(whole).toContain("End place: Salt Lake City");
    expect(whole).toContain("Start date: Sunday, October 10, 2027.");
  });

  it("says when the name given wasn't used, since the place has one", async () => {
    const trip = await newMoabTrip();
    const reply = await trip.updateItinerary({
      startPlace: { placeId: trip.place("Grand Junction").id, name: "GJ" },
    });
    expect(textOf(reply)).toContain(
      `Kept the name Grand Junction for ${trip.place("Grand Junction").id}, not "GJ", since a place's name can't change.`,
    );
  });

  it("fills in the name of a place Google has no name for", async () => {
    const trip = await newMoabTrip();
    const [house] = await trip.fixture.store.places.addPlaces(trip.tripId, [
      exampleAddress(),
    ]);
    const reply = await trip.updateItinerary({
      endPlace: { placeId: present(house).id, name: "Mike's house" },
    });
    expect(textOf(reply)).not.toContain("Kept the name");
    expect(await trip.read("all")).toContain("End place: Mike's house");
  });

  it("refuses a start date while there's no start place", async () => {
    const trip = await newMoabTrip();
    const reply = await trip.updateItinerary({ startDate: "2027-10-10" });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      "Nothing was changed. The itinerary needs a start place before a start date, since today's date comes from the start place's time zone.",
    );
  });

  it("refuses a start date that isn't after today, and gives today's date", async () => {
    const trip = await newMoabTrip();
    const reply = await trip.updateItinerary({
      startPlace: { placeId: trip.place("Grand Junction").id, name: "GJ" },
      startDate: "2026-10-15",
    });
    expect(textOf(reply)).toMatch(
      /^Nothing was changed\. The start date has to be after today, Thursday, October 15, 2026,/,
    );
  });

  it("refuses a call with nothing to change, and a place ID of another kind", async () => {
    const trip = await newMoabTrip();
    expect(textOf(await trip.updateItinerary({}))).toBe(
      "Nothing was changed. Give a start place, an end place, or a start date.",
    );
    expect(
      textOf(
        await trip.updateItinerary({
          endPlace: { placeId: "stay_k7m2x9qa", name: "Moab" },
        }),
      ),
    ).toBe("Nothing was changed. stay_k7m2x9qa is a stay ID, not a place ID.");
  });
});

describe("add_stay", () => {
  it("refuses a stay until the itinerary has its start place, end place, and start date", async () => {
    const trip = await newMoabTrip();
    const reply = await trip.addStay({
      placeId: trip.place("Moab").id,
      after: "first",
      nightCount: 3,
      tier: "midRange",
      tierRule: "stays of 2+ nights",
    });
    expect(textOf(reply)).toBe(
      "Nothing was changed. A stay can be added once the itinerary has its start place, end place, and start date. It still needs its start place, end place, start date.",
    );
  });

  it("builds the Moab skeleton: gives each new stay's days, and each leg's road time", async () => {
    const trip = await newMoabTrip();
    await withEnds(trip);
    const moab = textOf(
      await trip.addStay({
        placeId: trip.place("Moab").id,
        after: "first",
        nightCount: 3,
        tier: "midRange",
        tierRule: "stays of 2+ nights",
      }),
    );
    const [day1, day2, day3, lastDay] = await trip.days();
    expect(moab.split("\n")).toEqual([
      expect.stringMatching(
        new RegExp(
          `^Added the Moab stay \\(stay_\\w+\\), 3 nights: Day 1 \\(${String(day1)}\\), Day 2 \\(${String(day2)}\\), Day 3 \\(${String(day3)}\\)\\.$`,
        ),
      ),
      "Road time changed, without the drive buffer:",
      `- Day 1 (${String(day1)}): no leg → 30 m, 25 miles.`,
      `- Day 4 (${String(lastDay)}): 30 m → 30 m, 25 miles.`,
      "No new, changed, or gone check results.",
    ]);
    const moabStayId = present(/\((stay_\w+)\)/.exec(moab))[1];
    const torrey = textOf(
      await trip.addStay({
        placeId: trip.place("Torrey").id,
        after: moabStayId,
        nightCount: 1,
        tier: "value",
        tierRule: "the default tier",
      }),
    );
    expect(torrey).toMatch(
      /Added the Torrey stay \(stay_\w+\), 1 night: Day 4/,
    );
    const waypoint = await trip.setWaypoints({
      dayId: day1,
      waypoints: [trip.place("Dewey Bridge").id],
    });
    expect(textOf(waypoint)).toContain(
      `Set 1 waypoint on Day 1 (${String(day1)}).`,
    );
    const whole = await trip.read("all");
    expect(whole).toContain("Waypoints: Dewey Bridge");
    expect(whole.match(/- Leg: 25 miles, 30 m of road time/g)).toHaveLength(3);
  });
});

describe("update_stay", () => {
  it("moves Torrey first, and lists the stops on each day that now starts or ends somewhere else", async () => {
    const { updateStay, example } = await plannedMoab();
    const reply = textOf(
      await updateStay({ stayId: example.torrey.id, after: "first" }),
    );
    const [day1, day2] = example.moab.days;
    expect(reply).toContain(
      "Days that now start or end somewhere else. Each kept its stops:",
    );
    expect(reply).toContain(
      `- Day 2 (${present(day1).id}) now runs Torrey → Moab, and still holds: breakfast at Grand Junction café`,
    );
    expect(reply).not.toContain(`(${present(day2).id}) now runs`);
    expect(reply).toContain(
      `- Day 1 (${present(example.torrey.days[0]).id}) now runs Grand Junction → Torrey, and still holds:`,
    );
  });

  // The stay's hotel is still in Torrey, so the leg doesn't change. The day still moved.
  it("lists the stops on a day whose stay moved to another town, though its hotel didn't change", async () => {
    const { updateStay, example, fixture } = await plannedMoab();
    const [hanksville] = await fixture.store.places.addPlaces(example.trip.id, [
      placeNamed("Hanksville"),
    ]);
    const reply = textOf(
      await updateStay({
        stayId: example.torrey.id,
        placeId: present(hanksville).id,
      }),
    );
    expect(reply).toContain(
      `- Day 4 (${present(example.torrey.days[0]).id}) now runs Moab → Hanksville, and still holds:`,
    );
  });

  it("refuses to remove a night whose day holds stops, and lists them", async () => {
    const { updateStay, example } = await plannedMoab();
    const reply = textOf(
      await updateStay({ stayId: example.moab.id, nightCount: 2 }),
    );
    expect(reply).toMatch(
      /^Nothing was changed\. The days that would go still hold stops\. Move or remove them first: /,
    );
  });

  it("adds a night, and sets the tier in the same call", async () => {
    const { updateStay, read, example } = await plannedMoab();
    const reply = textOf(
      await updateStay({
        stayId: example.torrey.id,
        nightCount: 2,
        tier: { tier: "midRange", tierRule: "stays of 2+ nights" },
      }),
    );
    expect(reply).toMatch(/It has 2 nights: Day 4 \(day_\w+\), Day 5/);
    expect(reply).toMatch(/Days added: Day 5 \(day_\w+\)\./);
    expect(await read(example.torrey.id)).toContain(
      'Lodging tier: midRange, from the rule "stays of 2+ nights".',
    );
  });

  it("refuses a call with nothing to change", async () => {
    const { updateStay, example } = await plannedMoab();
    expect(textOf(await updateStay({ stayId: example.moab.id }))).toBe(
      "Nothing was changed. Give at least one change: placeId, after, nightCount, or tier.",
    );
  });
});

describe("remove_stay", () => {
  it("refuses while stops are on the stay's days, and lists them", async () => {
    const { removeStay, example } = await plannedMoab();
    const reply = textOf(await removeStay({ stayId: example.torrey.id }));
    expect(reply).toMatch(
      /^Nothing was changed\. The stay still has stops on its days or near it\. Move or remove them first: .*Gifford Homestead/,
    );
  });

  it("removes a stay with nothing on it, and its days", async () => {
    const trip = await newMoabTrip();
    await withEnds(trip);
    await trip.addStay({
      placeId: trip.place("Torrey").id,
      after: "first",
      nightCount: 1,
      tier: "value",
      tierRule: "the default tier",
    });
    const [torreyDay] = await trip.days();
    const stayId = present(
      /Stay 1 \((stay_\w+)\)/.exec(await trip.read("all")),
    )[1];
    const reply = textOf(await trip.removeStay({ stayId }));
    expect(reply).toContain(
      `Removed the Torrey stay (${String(stayId)}), and its days: ${String(torreyDay)}.`,
    );
    expect(await trip.days()).toHaveLength(1);
  });
});
