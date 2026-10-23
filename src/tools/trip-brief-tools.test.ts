import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { examplePlace } from "../domain/place.fake.js";
import { TripBusyError } from "../persistence/trip-errors.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { CLOCK_TIME_ERROR } from "./clock-time.js";
import type { ToolReply } from "./tool-reply.js";
import { updateTripBriefInput } from "./trip-brief-input.schema.js";
import { readTripBriefTool, updateTripBriefTool } from "./trip-brief-tools.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };
const UPDATE_TRIP_BRIEF_INPUT = updateTripBriefInput(setUp().settings);

// The tools for a new trip, with fakes for Postgres and Google (DEVELOPMENT.md
// section 5). Each call's input goes through the tool's schema first, as the Agent SDK
// does.
async function newTripTools(): Promise<
  ReturnType<typeof setUp> & {
    tripId: string;
    read: () => Promise<string>;
    update: (input: unknown) => Promise<ToolReply>;
  }
> {
  const fixture = setUp();
  const { id: tripId } = await fixture.writer.startTrip(OWNER);
  return { ...fixture, tripId, ...toolsFor({ ...fixture, tripId }) };
}

function toolsFor(session: Parameters<typeof readTripBriefTool>[0]): {
  read: () => Promise<string>;
  update: (input: unknown) => Promise<ToolReply>;
} {
  const readTool = readTripBriefTool(session);
  const updateTool = updateTripBriefTool(session);
  return {
    read: async () => textOf(await readTool.handler({})),
    update: (input) => updateTool.handler(input),
  };
}

function textOf(reply: ToolReply): string {
  return reply.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

describe("read_trip_brief", () => {
  it("shows every item of a new trip's brief, with the usual start time it starts with", async () => {
    const { read } = await newTripTools();
    expect(await read()).toBe(
      [
        "focus: not set",
        "tripLengthInDays: not set",
        "interestsText: not set",
        "mustSeesText: not set",
        "comfortableDrivingInHours: not set",
        "routePreference: not set",
        "restDaysText: not set",
        "usualStartTime: 8:00 a.m.",
        "defaultTier: not set",
        "budgetRulesText: not set",
        "mealPreferencesText: not set",
      ].join("\n"),
    );
  });
});

describe("update_trip_brief", () => {
  it("saves every item given, in one update", async () => {
    const { read, update } = await newTripTools();
    const reply = await update({
      focus: "Pacific Coast Highway",
      tripLengthInDays: 5,
      interestsText: "Coastal views, since we live inland",
      mustSeesText: "Big Sur, which Sam has never seen",
      comfortableDrivingInHours: 5.5,
      routePreference: "scenic",
      restDaysText: "no rest day",
      usualStartTime: "7:30 a.m.",
      defaultTier: "midRange",
      budgetRulesText: "posh for the last night",
      mealPreferencesText: "local seafood over hotel breakfast",
    });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply)).toMatch(/^Changed the trip brief\.\n/);
    expect(await read()).toBe(
      [
        "focus: Pacific Coast Highway",
        "tripLengthInDays: 5",
        "interestsText: Coastal views, since we live inland",
        "mustSeesText: Big Sur, which Sam has never seen",
        "comfortableDrivingInHours: 5.5",
        "routePreference: scenic",
        "restDaysText: no rest day",
        "usualStartTime: 7:30 a.m.",
        "defaultTier: midRange",
        "budgetRulesText: posh for the last night",
        "mealPreferencesText: local seafood over hotel breakfast",
      ].join("\n"),
    );
  });

  it("leaves the items not given alone, and replaces the ones given", async () => {
    const { read, update } = await newTripTools();
    await update({ focus: "Texas barbecue", tripLengthInDays: 4 });
    await update({ tripLengthInDays: 6 });
    const lines = (await read()).split("\n");
    expect(lines).toContain("focus: Texas barbecue");
    expect(lines).toContain("tripLengthInDays: 6");
  });

  it("refuses a trip length over the maximum, saves nothing, and gives the limit", async () => {
    const { read, update } = await newTripTools();
    const reply = await update({
      focus: "Texas barbecue",
      tripLengthInDays: 20,
    });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      "Nothing was changed. The trip brief's tripLengthInDays is at most 14, since a trip is at most 14 days long. It was given 20.",
    );
    expect(await read()).toContain("focus: not set");
  });

  it("refuses comfortable driving over the maximum, and gives the limit", async () => {
    const { update } = await newTripTools();
    const reply = await update({ comfortableDrivingInHours: 14 });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      "Nothing was changed. The trip brief's comfortableDrivingInHours is at most 12, the maximum daily driving. It was given 14.",
    );
  });

  it("refuses to empty an item, and names it", async () => {
    const { read, update } = await newTripTools();
    await update({ focus: "Texas barbecue" });
    const reply = await update({ focus: "  ", tripLengthInDays: 4 });
    expect(textOf(reply)).toBe(
      "Nothing was changed. The trip brief's focus can't be empty. Once it has a value, it can be changed but not emptied.",
    );
    expect(await read()).toContain("tripLengthInDays: not set");
  });

  it("refuses an item it doesn't know, and names it", () => {
    const parsed = UPDATE_TRIP_BRIEF_INPUT.safeParse({
      focus: "Utah",
      tripLength: 5,
    });
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      'Unrecognized key: "tripLength"',
    ]);
  });

  it("refuses an update with no items", async () => {
    const { update } = await newTripTools();
    const reply = await update({});
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      "Nothing was changed. Give at least one trip brief item to change.",
    );
  });

  it("takes the usual start time as a clock time, and refuses other forms", async () => {
    const { read, update } = await newTripTools();
    await update({ usualStartTime: "12:30 p.m." });
    expect(await read()).toContain("usualStartTime: 12:30 p.m.");
    const parsed = UPDATE_TRIP_BRIEF_INPUT.safeParse({
      usualStartTime: "13:00",
    });
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      CLOCK_TIME_ERROR,
    ]);
  });

  it("refuses any change once the trip has started, with the date it used", async () => {
    const fixture = setUp();
    const { trip, places } = exampleMoabTrip(OWNER);
    await fixture.store.add(trip);
    fixture.store.places.rows.push(
      ...places.map((place) => ({ tripId: trip.id, place })),
    );
    // Just after midnight on the start date, in Moab's time zone.
    fixture.clock.current = new Date("2027-10-10T06:00:30Z");
    const { update } = toolsFor({ ...fixture, tripId: trip.id });
    const reply = await update({ focus: "Arches and Canyonlands" });
    expect(textOf(reply)).toBe(
      `Nothing was changed. The trip has started, so it can't be changed. Today is ${new CalendarDate(2027, 10, 10).longText} at its start place, on or after its start date.`,
    );
  });

  it("says when the trip is busy, after the writer's tries", async () => {
    const { update, store } = await newTripTools();
    store.loadForWriteErrors.push(
      new TripBusyError(),
      new TripBusyError(),
      new TripBusyError(),
    );
    const reply = await update({ focus: "Texas barbecue" });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(new TripBusyError().message);
  });

  it("throws an error that isn't the agent's to act on", async () => {
    const { update, store } = await newTripTools();
    store.loadForWriteErrors.push(new Error("The connection was lost."));
    await expect(update({ focus: "Texas barbecue" })).rejects.toThrow(
      "The connection was lost.",
    );
  });
});

describe("update_trip_brief's check results", () => {
  // A trip with only its last day, from San Francisco to Mike's house.
  async function oneDayTrip(): Promise<
    Awaited<ReturnType<typeof newTripTools>>
  > {
    const tools = await newTripTools();
    const [start, end] = await tools.store.places.addPlaces(tools.tripId, [
      examplePlace({ name: "San Francisco", googlePlaceId: "google-sf" }),
      examplePlace({ name: "Mike's house", googlePlaceId: "google-la" }),
    ]);
    await tools.writer.write(
      tools.tripId,
      "worker",
      ({ trip, services, placeOf }) => {
        services.itinerary.setStartPlace(
          trip.itinerary,
          placeOf(start?.id ?? ""),
        );
        trip.itinerary.endPlace = placeOf(end?.id ?? "");
      },
    );
    return tools;
  }

  it("gives a new warning, then the trip-wide one already known, then the one gone", async () => {
    const { update } = await oneDayTrip();
    expect(textOf(await update({ tripLengthInDays: 3 }))).toBe(
      [
        "Changed the trip brief.",
        "Check results:",
        "- New warning: The trip is 1 day, and the brief asks for 3.",
      ].join("\n"),
    );
    expect(textOf(await update({ focus: "Pacific Coast Highway" }))).toBe(
      [
        "Changed the trip brief.",
        "Check results:",
        "- Already known warning: The trip is 1 day, and the brief asks for 3.",
      ].join("\n"),
    );
    expect(textOf(await update({ tripLengthInDays: 1 }))).toBe(
      [
        "Changed the trip brief.",
        "Check results:",
        "- Gone: The trip is 1 day, and the brief asks for 3.",
      ].join("\n"),
    );
    expect(textOf(await update({ focus: "Big Sur" }))).toBe(
      ["Changed the trip brief.", "No new or gone check results."].join("\n"),
    );
  });

  it("gives a day's warning again, with its new text, when the comfortable driving changes", async () => {
    const { update } = await oneDayTrip();
    await update({ comfortableDrivingInHours: 0.25 });
    expect(textOf(await update({ comfortableDrivingInHours: 0.2 }))).toBe(
      [
        "Changed the trip brief.",
        "Check results:",
        "- Already known warning: Day 1 needs about 33 m of driving. Comfortable driving is 0.2 hours a day.",
      ].join("\n"),
    );
  });
});
