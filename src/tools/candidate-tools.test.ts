import { describe, expect, it } from "vitest";

import { placeNamed } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import { exampleAddress } from "../domain/place.fake.js";
import {
  addLodgingCandidatesTool,
  addStopCandidatesTool,
} from "./candidate-tools.js";
import { plannedMoab } from "./skeleton-tools.fake.js";
import { textOf } from "./stored-trip.fake.js";
import type { StrictToolDefinition } from "./strict-tool.js";
import type { ToolReply } from "./tool-reply.js";
import type { TripSession } from "./trip-session.js";
import { ADD_LODGING_CANDIDATES_INPUT } from "./worker-input.schema.js";

// add_lodging_candidates and add_stop_candidates over the Moab example as planned
// (domain model 5.2), in the fake store. Each stop and stay there already has a set:
// the place selected for it. The fake route finder gives each segment 30 minutes.

const GOOGLE_LINK = "https://maps.google.com/?cid=1";

async function moabWithPlaces(names: readonly string[]) {
  const planned = await plannedMoab();
  const tripId = planned.example.trip.id;
  const stored = await planned.fixture.store.places.addPlaces(
    tripId,
    names.map((name) => placeNamed(name)),
  );
  const session: TripSession = { ...planned.fixture, tripId };
  const call =
    (make: (session: TripSession) => StrictToolDefinition) =>
    (input: unknown): Promise<ToolReply> => {
      const tool = make(session);
      // The Agent SDK checks the input against the schema before the handler runs.
      return tool.handler(tool.inputSchema.parse(input));
    };
  return {
    ...planned,
    tripId,
    placeId: (name: string) =>
      present(stored.find((each) => each.name === name)).id,
    addLodging: call(addLodgingCandidatesTool),
    addStop: call(addStopCandidatesTool),
  };
}

// How many routes went through any of the places named, as a detour time's does. Each
// test place's Google place ID is made from its name (placeNamed()). The write's
// finish routes legs too, such as Day 1's, whose waypoint the example sets after routing
// it.
function routesThrough(
  trip: Awaited<ReturnType<typeof moabWithPlaces>>,
  names: readonly string[],
): number {
  return trip.fixture.routeFinder.routes.filter((path) =>
    path.through.some((point) =>
      names.some((name) => point.place.googlePlaceId === `google-${name}`),
    ),
  ).length;
}

// A candidate found on Google, with no notes.
function found(placeId: string, rationale = "Fits the trip.") {
  return {
    placeId,
    name: "a name Google already has",
    rationale,
    howFound: "google",
    sourceLink: GOOGLE_LINK,
    notes: "",
  };
}

describe("add_lodging_candidates", () => {
  it("saves a set to the stay, after the set it has, with one line per candidate", async () => {
    const trip = await moabWithPlaces(["Red Cliffs Lodge", "Hoodoo Moab"]);
    const { moab } = trip.example;
    const reply = await trip.addLodging({
      stayId: moab.id,
      candidates: [
        { ...found(trip.placeId("Red Cliffs Lodge")), tier: "upscale" },
        {
          ...found(trip.placeId("Hoodoo Moab"), "Walkable to downtown."),
          howFound: "webSearch",
          sourceLink: "https://example.com/moab-hotels",
          notes: "  reservations advised ",
          tier: "midRange",
        },
      ],
    });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply).split("\n")).toEqual([
      `Lodging set 2 for Stay 1, Moab (${moab.id}): 2 candidates.`,
      expect.stringMatching(
        /^- Red Cliffs Lodge \(place_\w+\), .+\. Why: "Fits the trip\." Tier: upscale\.$/,
      ),
      expect.stringMatching(
        /^- Hoodoo Moab \(place_\w+\), .+\. Why: "Walkable to downtown\." Tier: midRange\. Notes: "reservations advised"$/,
      ),
    ]);
    const saved = (await trip.fixture.reader.read(trip.tripId)).itinerary
      .stays[0];
    expect(
      saved?.lodgingCandidates.map((each) => [
        each.place.name,
        each.setNumber,
        each.howFound,
        each.sourceLink,
        each.notesText,
        each.tier,
      ]),
    ).toEqual([
      ["Moab hotel", 0, "specifiedByUser", null, null, null],
      ["Red Cliffs Lodge", 1, "google", GOOGLE_LINK, null, "upscale"],
      [
        "Hoodoo Moab",
        1,
        "webSearch",
        "https://example.com/moab-hotels",
        "reservations advised",
        "midRange",
      ],
    ]);
    // The selection stays (tool design 2.1).
    expect(saved?.lodging?.name).toBe("Moab hotel");
  });

  it("gives a place Google has no name for the name given", async () => {
    const trip = await moabWithPlaces([]);
    const [house] = await trip.fixture.store.places.addPlaces(trip.tripId, [
      exampleAddress(),
    ]);
    const reply = await trip.addLodging({
      stayId: trip.example.torrey.id,
      candidates: [
        {
          ...found(present(house).id),
          name: "Torrey B&B",
          tier: "value",
        },
      ],
    });
    expect(textOf(reply)).toMatch(
      /^Lodging set 2 for Stay 2, Torrey \(stay_\w+\): 1 candidate\.\n- Torrey B&B \(place_\w+\)/,
    );
  });

  it("refuses a place already a candidate there, a place given twice, and a rejected place, and saves nothing", async () => {
    const trip = await moabWithPlaces(["Red Cliffs Lodge", "Hoodoo Moab"]);
    const { moab } = trip.example;
    const hotelId = present(moab.lodging).id;
    const lodge = { ...found(trip.placeId("Red Cliffs Lodge")), tier: "value" };
    const add = async (candidates: unknown[]) =>
      textOf(await trip.addLodging({ stayId: moab.id, candidates }));
    expect(await add([lodge, { ...found(hotelId), tier: "value" }])).toBe(
      `Nothing was changed. Moab hotel is already a candidate for the lodging of Stay 1, Moab (${moab.id}).`,
    );
    expect(await add([lodge, lodge])).toBe(
      "Nothing was changed. Red Cliffs Lodge is given more than once.",
    );
    await trip.rejectPlaces({
      rejections: [
        { placeId: trip.placeId("Hoodoo Moab"), reason: "too noisy" },
      ],
    });
    expect(
      await add([
        lodge,
        { ...found(trip.placeId("Hoodoo Moab")), tier: "value" },
      ]),
    ).toBe(
      'Nothing was changed. The user rejected Hoodoo Moab for this trip, because "too noisy".',
    );
    const saved = (await trip.fixture.reader.read(trip.tripId)).itinerary
      .stays[0];
    expect(saved?.lodgingCandidates).toHaveLength(1);
  });

  it("takes 1 to 3 candidates, each with a tier, and only a web page's link", () => {
    const schema = ADD_LODGING_CANDIDATES_INPUT;
    const candidate = { ...found("place_a"), tier: "value" };
    const parses = (candidates: unknown[]) =>
      schema.safeParse({ stayId: "stay_a", candidates }).success;
    expect(parses([candidate])).toBe(true);
    expect(parses([])).toBe(false);
    expect(parses([candidate, candidate, candidate, candidate])).toBe(false);
    expect(parses([{ ...found("place_a") }])).toBe(false);
    expect(parses([{ ...candidate, sourceLink: "javascript:alert(1)" }])).toBe(
      false,
    );
    expect(parses([{ ...candidate, howFound: "specifiedByUser" }])).toBe(false);
  });
});

describe("add_stop_candidates", () => {
  it("saves a set to a meal stop along the leg, each with its detour time, worked out against the day's leg", async () => {
    const trip = await moabWithPlaces(["Pie shop", "Bakery"]);
    const { gifford } = trip.example.stops;
    // Day 4's leg takes 104 + 77 + 18 + 22 + 13 = 234 minutes. Each place is measured
    // in Stop 2's spot, among the day's other selected stops: 5 segments. The fake gives
    // the pie shop's route 5 × 60 = 300 minutes, a detour of 66. The bakery's gets 5 ×
    // 30 = 150, less than the leg, so its detour is 0.
    const pieId = trip.placeId("Pie shop");
    trip.fixture.routeFinder.driveTimesFor = (path) =>
      path.through.some(
        (point) => point.place.googlePlaceId === "google-Pie shop",
      )
        ? [60, 60, 60, 60, 60]
        : null;
    const reply = await trip.addStop({
      stopId: gifford.id,
      candidates: [
        { ...found(pieId, "Famous pie."), tier: "value" },
        {
          ...found(trip.placeId("Bakery")),
          notes: "closed Sundays",
          tier: "midRange",
        },
      ],
    });
    expect(routesThrough(trip, ["Pie shop", "Bakery"])).toBe(2);
    expect(textOf(reply).split("\n")).toEqual([
      `Set 2 for Day 4, Stop 2 (${gifford.id}), meal: "pie": 2 candidates.`,
      expect.stringMatching(
        /^- Pie shop \(place_\w+\), .+, detour 1 h 6 m when offered\. Why: "Famous pie\." Tier: value\.$/,
      ),
      expect.stringMatching(
        /^- Bakery \(place_\w+\), .+, detour 0 m when offered\. Why: "Fits the trip\." Tier: midRange\. Notes: "closed Sundays"$/,
      ),
    ]);
    const read = await trip.read(gifford.id);
    expect(read).toMatch(
      /- Set 2: Pie shop \(place_\w+\), .+, detour 1 h 6 m when offered\./,
    );
    // The selection stays.
    expect(read).toContain("Selected: Gifford Homestead");
  });

  it("saves an attraction's candidates with their visit times, and no detour time near a stay", async () => {
    const trip = await moabWithPlaces(["Dark sky park"]);
    const { panoramaPoint } = trip.example.stops;
    const reply = await trip.addStop({
      stopId: panoramaPoint.id,
      candidates: [
        { ...found(trip.placeId("Dark sky park")), visitTimeInMinutes: 90 },
      ],
    });
    expect(routesThrough(trip, ["Dark sky park"])).toBe(0);
    expect(textOf(reply).split("\n")).toEqual([
      `Set 2 for Day 4, Stop 4 (${panoramaPoint.id}), attraction: "stargazing": 1 candidate.`,
      expect.stringMatching(
        /^- Dark sky park \(place_\w+\), .+, visit time 1 h 30 m\. Why: "Fits the trip\."$/,
      ),
    ]);
  });

  it("refuses a candidate whose shape doesn't fit the stop's kind", async () => {
    const trip = await moabWithPlaces(["Pie shop"]);
    const { gifford, fisherTowers } = trip.example.stops;
    const pie = found(trip.placeId("Pie shop"));
    expect(
      textOf(
        await trip.addStop({
          stopId: gifford.id,
          candidates: [{ ...pie, visitTimeInMinutes: 30 }],
        }),
      ),
    ).toBe(
      `Nothing was changed. Day 4, Stop 2 (${gifford.id}), meal: "pie" is a meal stop, so each candidate takes a tier, and no visitTimeInMinutes.`,
    );
    expect(
      textOf(
        await trip.addStop({
          stopId: fisherTowers.id,
          candidates: [{ ...pie, tier: "value" }],
        }),
      ),
    ).toBe(
      `Nothing was changed. Day 1, Stop 2 (${fisherTowers.id}), attraction: "towers" is an attraction stop, so each candidate takes visitTimeInMinutes, and no tier.`,
    );
  });

  it("refuses a repeat before routing anything, and saves nothing", async () => {
    const trip = await moabWithPlaces(["Pie shop"]);
    const { gifford } = trip.example.stops;
    const reply = await trip.addStop({
      stopId: gifford.id,
      candidates: [
        { ...found(trip.placeId("Pie shop")), tier: "value" },
        { ...found(present(gifford.selectedPlace).id), tier: "value" },
      ],
    });
    expect(textOf(reply)).toBe(
      `Nothing was changed. Gifford Homestead is already a candidate for Day 4, Stop 2 (${gifford.id}), meal: "pie".`,
    );
    expect(routesThrough(trip, ["Pie shop"])).toBe(0);
    expect(await trip.read(gifford.id)).not.toContain("Set 2");
  });

  it("refuses a check-in, a stay ID, and a place the trip doesn't have", async () => {
    const trip = await moabWithPlaces(["Pie shop"]);
    const day4 = present(trip.example.torrey.days[0]);
    const added = textOf(
      await trip.addStops({
        dayId: day4.id,
        after: "first",
        stops: [{ kind: "checkIn", purpose: "check in", setTime: "none" }],
      }),
    );
    const checkInId = present(/\((stop_\w+)\), checkIn/.exec(added))[1] ?? "";
    const pie = { ...found(trip.placeId("Pie shop")), tier: "value" };
    const add = async (stopId: string, candidates = [pie]) =>
      textOf(await trip.addStop({ stopId, candidates }));
    expect(await add(checkInId)).toBe(
      `Nothing was changed. ${checkInId} is a check-in. A check-in has no candidates, so no worker fills it.`,
    );
    expect(await add(trip.example.torrey.id)).toBe(
      `Nothing was changed. ${trip.example.torrey.id} is a stay ID, not a stop ID.`,
    );
    expect(
      await add(trip.example.stops.gifford.id, [
        { ...pie, placeId: "place_zzzzzzzz" },
      ]),
    ).toMatch(/^Nothing was changed\. .*place_zzzzzzzz/);
  });
});
