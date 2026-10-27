import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { SET_WAYPOINTS_INPUT } from "./skeleton-input.schema.js";
import { newMoabTrip, plannedMoab, withEnds } from "./skeleton-tools.fake.js";
import { placeLine } from "./stop-lines.js";
import { textOf } from "./stored-trip.fake.js";

describe("update_day", () => {
  it("marks a day that stays put as a rest day, which removes its leg", async () => {
    const { updateDay, read, example } = await plannedMoab();
    const day3 = present(example.moab.days[2]);
    // The example's Day 3 is already a rest day, so it drives first. It holds only
    // stops with set times.
    await updateDay({ dayId: day3.id, isRestDay: false });
    expect(await read(day3.id)).not.toContain("Rest day.");
    const reply = textOf(await updateDay({ dayId: day3.id, isRestDay: true }));
    expect(reply).toMatch(/^Changed Day 3 \(day_\w+\)\./);
    expect(reply).toContain(`- Day 3 (${day3.id}): 1 h → no leg.`);
    const day = await read(day3.id);
    expect(day).toContain("Rest day.");
    expect(day).toContain("- No leg.");
  });

  it("refuses a rest day on a day that moves, and on the last day", async () => {
    const { updateDay, example } = await plannedMoab();
    const day1 = present(example.moab.days[0]);
    expect(textOf(await updateDay({ dayId: day1.id, isRestDay: true }))).toBe(
      "Nothing was changed. Only a day that starts and ends at the same stay can be a rest day. This day moves to a new stay, so it has to drive.",
    );
    const lastDay = example.trip.itinerary.lastDay;
    expect(
      textOf(await updateDay({ dayId: lastDay.id, isRestDay: true })),
    ).toBe(
      "Nothing was changed. The last day can't be a rest day, since it drives to the end place.",
    );
  });

  it("sets a start time, then the usual one again with default", async () => {
    const { updateDay, read, example } = await plannedMoab();
    const day1 = present(example.moab.days[0]);
    await updateDay({ dayId: day1.id, startTime: "7:00 a.m." });
    expect(await read(day1.id)).toContain(
      "Starts 7:00 a.m., the day's own start time.",
    );
    await updateDay({ dayId: day1.id, startTime: "default" });
    expect(await read(day1.id)).toContain(
      "Starts 8:00 a.m., the usual start time.",
    );
  });

  it("approves longer driving on Day 1, and a read gives the approval", async () => {
    const { updateDay, read, example } = await plannedMoab();
    const day1 = present(example.moab.days[0]);
    expect(await read(day1.id)).not.toContain("Approval:");
    const reply = textOf(
      await updateDay({
        dayId: day1.id,
        approveDriveHours: { hours: 4.5, reason: "a slow day on the river" },
      }),
    );
    expect(reply).toMatch(/^Changed Day 1 \(day_\w+\)\./);
    expect(await read(day1.id)).toContain(
      '- Approval: drive hours, up to 4.5 hours of driving, because "a slow day on the river". It applies.',
    );
  });

  it("refuses more hours than the maximum daily driving, and an empty reason", async () => {
    const { updateDay, example } = await plannedMoab();
    const day1 = present(example.moab.days[0]);
    expect(
      textOf(
        await updateDay({
          dayId: day1.id,
          approveDriveHours: { hours: 13, reason: "long day" },
        }),
      ),
    ).toBe(
      "Nothing was changed. A day's driving is at most 12 hours, so an approval can't go over it. It was given 13.",
    );
    expect(
      textOf(
        await updateDay({
          dayId: day1.id,
          approveRouteType: { routeType: "fastest", reason: " " },
        }),
      ),
    ).toMatch(/^Nothing was changed\. .*reason/);
  });

  it("refuses a call with nothing to change, and a stay ID for the day", async () => {
    const { updateDay, example } = await plannedMoab();
    expect(
      textOf(await updateDay({ dayId: present(example.moab.days[0]).id })),
    ).toBe(
      "Nothing was changed. Give at least one change: isRestDay, startTime, approveDriveHours, approveRouteType, or removeApproval.",
    );
    expect(
      textOf(await updateDay({ dayId: example.moab.id, isRestDay: false })),
    ).toBe(
      `Nothing was changed. ${example.moab.id} is a stay ID, not a day ID.`,
    );
  });
});

describe("set_waypoints", () => {
  it("sets waypoints, each with its reason, then clears them with an empty list, and re-routes the leg each time", async () => {
    const trip = await moabDayOne();
    const { dayId, dewey } = trip;
    const set = textOf(
      await trip.setWaypoints({
        dayId,
        waypoints: [{ placeId: dewey.id, reason: "steer onto UT-128" }],
      }),
    );
    expect(set).toContain(
      `Set 1 waypoint on Day 1 (${dayId}):\n- ${placeLine(dewey)}. Reason: "steer onto UT-128".`,
    );
    expect(set).toContain(`- Day 1 (${dayId}): 30 m → 2 h, 25 miles.`);
    const routed = trip.fixture.routeFinder.routes.at(-1);
    expect(routed?.through.map((point) => point.isPassThrough)).toEqual([true]);
    expect(await trip.read(dayId)).toContain(
      `- Leg: 25 miles, 2 h of road time, 2 h 12 m of driving with the drive buffer.\n  - Waypoint: ${placeLine(dewey)}. Reason: "steer onto UT-128".`,
    );
    const cleared = textOf(await trip.setWaypoints({ dayId, waypoints: [] }));
    expect(cleared).toContain(`Cleared the waypoints on Day 1 (${dayId}).`);
    expect(cleared).toContain(`- Day 1 (${dayId}): 2 h → 1 h 40 m, 25 miles.`);
    expect(await trip.read(dayId)).not.toContain("Waypoint:");
  });

  it("refuses a waypoint without a reason", async () => {
    const { dayId, dewey, setWaypoints } = await moabDayOne();
    expect(
      SET_WAYPOINTS_INPUT.safeParse({
        dayId,
        waypoints: [{ placeId: dewey.id }],
      }).success,
    ).toBe(false);
    expect(
      textOf(
        await setWaypoints({
          dayId,
          waypoints: [{ placeId: dewey.id, reason: " " }],
        }),
      ),
    ).toBe(
      `Nothing was changed. A waypoint needs a reason, such as "steer onto US-1". The one at ${dewey.id} has none.`,
    );
  });

  it("refuses a day with no leg, and a waypoint given twice", async () => {
    const trip = await newMoabTrip();
    await withEnds(trip);
    await trip.addStay({
      placeId: trip.place("Moab").id,
      after: "first",
      nightCount: 2,
      tier: "midRange",
      tierRule: "stays of 2+ nights",
    });
    const [day1, day2] = await trip.days();
    const dewey = { placeId: trip.place("Dewey Bridge").id, reason: "UT-128" };
    expect(
      textOf(await trip.setWaypoints({ dayId: day2, waypoints: [dewey] })),
    ).toBe(
      "Nothing was changed. A day with no leg can't have waypoints, such as a rest day, or a day that stays put with no selected stop yet.",
    );
    expect(
      textOf(
        await trip.setWaypoints({
          dayId: day1,
          waypoints: [dewey, { ...dewey, reason: "the river" }],
        }),
      ),
    ).toBe("Nothing was changed. Give each waypoint once.");
  });
});

describe("update_day: approving a route type", () => {
  it("approving fastest clears the day's waypoints, names each with its reason, and gives the leg's new road time", async () => {
    const trip = await moabDayOne();
    const { dayId, dewey } = trip;
    const fisher = trip.place("Fisher Towers");
    await trip.setWaypoints({
      dayId,
      waypoints: [
        { placeId: dewey.id, reason: "steer onto UT-128" },
        { placeId: fisher.id, reason: "must-see: Fisher Towers" },
      ],
    });
    const reply = textOf(
      await trip.updateDay({
        dayId,
        approveRouteType: { routeType: "fastest", reason: "get to Moab early" },
      }),
    );
    expect(reply).toContain(
      [
        `Changed Day 1 (${dayId}).`,
        "Approving fastest cleared the day's 2 waypoints:",
        `- ${placeLine(dewey)}. Reason: "steer onto UT-128".`,
        `- ${placeLine(fisher)}. Reason: "must-see: Fisher Towers".`,
        "Road time changed, without the drive buffer:",
        `- Day 1 (${dayId}): 2 h → 1 h 40 m, 25 miles.`,
      ].join("\n"),
    );
    const day = await trip.read(dayId);
    expect(day).not.toContain("Waypoint:");
    expect(day).toContain(
      '- Approval: route type fastest, because "get to Moab early".',
    );
  });

  it("approving scenic leaves the waypoints, and re-routes nothing", async () => {
    const trip = await moabDayOne();
    const { dayId, dewey } = trip;
    await trip.setWaypoints({
      dayId,
      waypoints: [{ placeId: dewey.id, reason: "steer onto UT-128" }],
    });
    const reply = textOf(
      await trip.updateDay({
        dayId,
        approveRouteType: { routeType: "scenic", reason: "the river road" },
      }),
    );
    expect(reply).not.toContain("cleared");
    expect(reply).not.toContain("Road time changed");
    expect(await trip.read(dayId)).toContain(
      `  - Waypoint: ${placeLine(dewey)}. Reason: "steer onto UT-128".`,
    );
  });
});

// A Moab trip with one stay, so Day 1 has a leg. The fake route finder gives the leg
// 1 h 40 m without waypoints, and 2 h through any.
async function moabDayOne() {
  const trip = await newMoabTrip();
  await withEnds(trip);
  await trip.addStay({
    placeId: trip.place("Moab").id,
    after: "first",
    nightCount: 1,
    tier: "value",
    tierRule: "the default tier",
  });
  const [day1] = await trip.days();
  trip.fixture.routeFinder.driveTimesFor = (path) =>
    path.through.length === 0 ? [100] : [120];
  return { ...trip, dayId: present(day1), dewey: trip.place("Dewey Bridge") };
}
