import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { plannedMoab } from "./skeleton-tools.fake.js";
import { textOf } from "./stored-trip.fake.js";

// add_stops, update_stop, move_stop, and remove_stops, over the Moab example as planned
// (domain model 5.2), in the fake store.

describe("add_stops", () => {
  it("adds a day's stops in order after the stop given, and the reply gives their IDs", async () => {
    const { addStops, read, example } = await plannedMoab();
    const day1 = present(example.moab.days[0]);
    const reply = textOf(
      await addStops({
        dayId: day1.id,
        after: example.stops.fisherTowers.id,
        stops: [
          {
            kind: "attraction",
            purpose: "a river view",
            searchArea: "alongLeg",
            setTime: "none",
          },
          {
            kind: "meal",
            purpose: "ice cream",
            searchArea: example.moab.id,
            setTime: "9:00 p.m.",
          },
        ],
      }),
    );
    expect(reply).toMatch(
      /^Added 2 stops to Day 1 \(day_\w+\):\n- Day 1, Stop 3 \(stop_\w+\), attraction: "a river view"\n- Day 1, Stop 4 \(stop_\w+\), meal: "ice cream"\n/,
    );
    const day = await read(day1.id);
    expect(day).toMatch(
      /Stop 4 \(stop_\w+\), meal: "ice cream"\. Near the Moab stay\. Set time: 9:00 p\.m\. No candidates yet\./,
    );
  });

  it("adds a check-in at the stay the party sleeps at that night, with no search area, and re-routes the leg through it", async () => {
    const { addStops, updateStop, read, example, fixture } =
      await plannedMoab();
    const day4 = present(example.torrey.days[0]);
    const routeCount = fixture.routeFinder.routes.length;
    const reply = textOf(
      await addStops({
        dayId: day4.id,
        after: present(day4.stops[2]).id,
        stops: [{ kind: "checkIn", purpose: "check in", setTime: "none" }],
      }),
    );
    expect(reply).toMatch(
      /^Added 1 stop to Day 4 \(day_\w+\):\n- Day 4, Stop 4 \(stop_\w+\), checkIn: "check in"\n/,
    );
    const checkInId = present(/Stop 4 \((stop_\w+)\)/.exec(reply))[1] ?? "";
    // Day 4 is re-routed through the Torrey hotel, between Capitol Gorge and
    // Panorama Point.
    const stopNames = fixture.routeFinder.routes
      .slice(routeCount)
      .map((route) =>
        route.through
          .filter((point) => !point.isPassThrough)
          .map((point) => point.place.name),
      );
    expect(stopNames).toContainEqual([
      "Goblin Valley State Park",
      "Gifford Homestead",
      "Capitol Gorge",
      "Torrey hotel",
      "Panorama Point",
    ]);
    expect(await read(day4.id)).toMatch(
      /Stop 4 \(stop_\w+\), checkIn: "check in"\. At where the party sleeps that night: Torrey hotel \(place_\w+\), Lockhart\. Visit time 30 m\./,
    );
    await updateStop({ stopId: checkInId, visitTimeInMinutes: 120 });
    expect(await read(checkInId)).toContain("Visit time 2 h.");
    expect(
      textOf(
        await addStops({
          dayId: example.trip.itinerary.lastDay.id,
          after: "first",
          stops: [{ kind: "checkIn", purpose: "check in", setTime: "none" }],
        }),
      ),
    ).toMatch(/the last day has no stay to sleep at/);
  });

  it("puts stops first, and takes a set time after midnight", async () => {
    const { addStops, read, example } = await plannedMoab();
    const day4 = present(example.torrey.days[0]);
    await addStops({
      dayId: day4.id,
      after: "first",
      stops: [
        {
          kind: "attraction",
          purpose: "a night sky walk",
          searchArea: example.torrey.id,
          setTime: "1:30 a.m. the next day",
        },
      ],
    });
    expect(await read(day4.id)).toMatch(
      /Stop 1 \(stop_\w+\), attraction: "a night sky walk"\. Near the Torrey stay\. Set time: 1:30 a\.m\. the next day\./,
    );
  });

  it("refuses the whole call when one stop doesn't fit the day, or names no search area", async () => {
    const { addStops, read, example } = await plannedMoab();
    const day3 = present(example.moab.days[2]);
    const before = await read(day3.id);
    const call = (searchArea: string) =>
      addStops({
        dayId: day3.id,
        after: "first",
        stops: [
          {
            kind: "attraction",
            purpose: "a short walk",
            searchArea: example.moab.id,
            setTime: "9:00 a.m.",
          },
          {
            kind: "attraction",
            purpose: "a drive",
            searchArea,
            setTime: "none",
          },
        ],
      });
    expect(textOf(await call("alongLeg"))).toMatch(
      /^Nothing was changed\. No stops were added\. a drive \(stop_\w+\) is along the leg, but this day stays put, so it has no leg to be along\. a drive \(stop_\w+\) has no set time, and each stop on a rest day needs one\.$/,
    );
    expect(textOf(await call("near the hotel"))).toBe(
      'Nothing was changed. A search area is a stay ID, or "alongLeg", "nearStartPlace", or "nearEndPlace". It was given "near the hotel".',
    );
    expect(await read(day3.id)).toBe(before);
  });
});

describe("update_stop", () => {
  it("changes a visit time, and refuses a call with no change", async () => {
    const { updateStop, read, example } = await plannedMoab();
    const towers = example.stops.fisherTowers;
    const reply = textOf(
      await updateStop({ stopId: towers.id, visitTimeInMinutes: 300 }),
    );
    expect(reply).toMatch(
      /^Changed Day 1, Stop 2 \(stop_\w+\), attraction: "towers"\./,
    );
    expect(await read(towers.id)).toContain("visit time 5 h.");
    expect(textOf(await updateStop({ stopId: towers.id }))).toBe(
      "Nothing was changed. Give at least one change: setTime, visitTimeInMinutes, approveOpeningHours, or removeApproval.",
    );
  });

  it("approves opening hours at the new set time, and gives the minutes it recorded", async () => {
    const { updateStop, example } = await plannedMoab();
    const reply = textOf(
      await updateStop({
        stopId: example.stops.milts.id,
        setTime: "12:00 p.m.",
        approveOpeningHours: { reason: "we'll eat fast" },
      }),
    );
    expect(reply).toMatch(
      /Approved its opening hours, with 30 m of the visit open\./,
    );
  });
});

describe("move_stop", () => {
  it("moves a stop first on its day, with its set time restated", async () => {
    const { moveStop, read, example } = await plannedMoab();
    const milts = example.stops.milts;
    const day2 = present(example.moab.days[1]);
    const reply = textOf(
      await moveStop({
        stopId: milts.id,
        dayId: day2.id,
        after: "first",
        setTime: "none",
      }),
    );
    expect(reply).toMatch(
      /^Moved the stop\. It's now Day 2, Stop 1 \(stop_\w+\), meal: "burgers"\./,
    );
    expect(await read(milts.id)).not.toContain("Set time:");
  });

  it("refuses to move a stop along the leg to a day that stays put", async () => {
    const { moveStop, example } = await plannedMoab();
    const day3 = present(example.moab.days[2]);
    expect(
      textOf(
        await moveStop({
          stopId: example.stops.fisherTowers.id,
          dayId: day3.id,
          after: "first",
          setTime: "10:00 a.m.",
        }),
      ),
    ).toMatch(
      /is along the leg, and that day stays put, so it has no leg to be along\. Remove the stop and add a new one instead\.$/,
    );
  });
});

describe("remove_stops", () => {
  it("removes stops on different days, and refuses a stop given twice", async () => {
    const { removeStops, read, example } = await plannedMoab();
    const { milts, gifford } = example.stops;
    expect(textOf(await removeStops({ stopIds: [milts.id, milts.id] }))).toBe(
      "Nothing was changed. Give each stop once.",
    );
    const reply = textOf(
      await removeStops({ stopIds: [milts.id, gifford.id] }),
    );
    expect(reply).toMatch(
      /^Removed:\n- Day 2, Stop 4 \(stop_\w+\), meal: "burgers"\n- Day 4, Stop 2 \(stop_\w+\), meal: "pie"\n/,
    );
    const whole = await read("all");
    expect(whole).not.toContain(milts.id);
    expect(whole).not.toContain(gifford.id);
  });
});
