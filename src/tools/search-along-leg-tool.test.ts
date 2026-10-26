import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { routeDayAlong } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import { sanFranciscoDay2 } from "../domain/legs.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import { examplePlace } from "../domain/place.fake.js";
import { RejectedPlace } from "../domain/rejected-place.js";
import type { Trip } from "../domain/trip.js";
import { FIELD_MASK } from "../google/places-client.js";
import { routesResponseSchema } from "../google/routes.schema.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { fakePlacesAccess } from "./places-session.fake.js";
import { searchAlongLegTool } from "./search-along-leg-tool.js";
import { storeTrip, textOf } from "./stored-trip.fake.js";
import type { ToolReply } from "./tool-reply.js";

// Google's answers for state parks and tourist attractions along the saved Big Sur route,
// Monterey to San Luis Obispo, on 2026-10-26, cut down to a few places (DEVELOPMENT.md
// section 5).
function savedText(name: string): string {
  return readFileSync(
    new URL(`../google/saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

const STATE_PARKS = savedText("along-big-sur-state-parks");
const ATTRACTIONS = savedText("along-big-sur-attractions");
const BIG_SUR_ROUTE = present(
  routesResponseSchema.parse(JSON.parse(savedText("route-through-big-sur"))),
);
const HARMONY_GOOGLE_ID = "ChIJneb26AMk7YAREkSwtoYLGyo";

// San Francisco Day 2 (domain model 5.1), routed along the saved route: 7 and 194
// minutes, through First Awakenings and Big Sur village.
function plannedDay2(
  segmentDriveTimesInMinutes: readonly number[] = [7, 194],
): ReturnType<typeof sanFranciscoDay2> {
  const planning = sanFranciscoDay2();
  routeDayAlong(planning.calendar, planning.itinerary, planning.day2, {
    segmentDriveTimesInMinutes,
    distanceInMiles: 139,
    routeLine: BIG_SUR_ROUTE.polyline.encodedPolyline,
  });
  return planning;
}

interface Search {
  search: (input: unknown) => Promise<ToolReply>;
  // Each request sent to Google.
  sent: { headers: unknown; body: unknown }[];
}

async function searchFor(trip: Trip, body: string): Promise<Search> {
  const fixture = setUp();
  await storeTrip(fixture, trip);
  const sent: Search["sent"] = [];
  const fetchFake: typeof fetch = (url, init) => {
    sent.push({
      headers: init?.headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    return Promise.resolve(new Response(body));
  };
  const session = { ...fakePlacesAccess(fixture, fetchFake), tripId: trip.id };
  const tool = searchAlongLegTool(session);
  return { search: (input) => tool.handler(input), sent };
}

// Each place's name line, without its ID.
function namesIn(reply: ToolReply): string[] {
  return textOf(reply)
    .split("\n")
    .flatMap((line) => /^(.+) \(place_\w+\)$/.exec(line)?.[1] ?? []);
}

describe("search_along_leg", () => {
  it("sends the leg's route line from the trip, not the model", async () => {
    const planning = plannedDay2();
    const { search, sent } = await searchFor(planning.trip, STATE_PARKS);
    await search({ dayId: planning.day2.id, query: "state park" });
    expect(sent[0]?.headers).toMatchObject({ "X-Goog-FieldMask": FIELD_MASK });
    expect(sent.map((each) => each.body)).toEqual([
      {
        textQuery: "state park",
        pageSize: 20,
        searchAlongRouteParameters: {
          polyline: { encodedPolyline: BIG_SUR_ROUTE.polyline.encodedPolyline },
        },
      },
    ]);
  });

  // Google gives Andrew Molera first. Its fastest drives to Estero Bluffs and Harmony
  // Headlands skip the coast, so they'd put Estero Bluffs first. The route line puts
  // them as the drive reaches them (Google design 2.4).
  it("puts places in the order the drive reaches them, by the leg's route line, and keeps Point Lobos", async () => {
    const planning = plannedDay2();
    const { search } = await searchFor(planning.trip, STATE_PARKS);
    const reply = await search({
      dayId: planning.day2.id,
      query: "state park",
    });
    expect(reply.isError).toBeUndefined();
    const lines = textOf(reply).split("\n");
    expect(lines[0]).toBe(
      `Places for "state park" along Day 2's drive (${planning.day2.id}), from Monterey to San Luis Obispo, in the order the drive reaches them. Hours are for Friday, May 14, 2027.`,
    );
    expect(namesIn(reply)).toEqual([
      "Ishxenta State Park",
      "China Cove",
      "Andrew Molera State Park",
      "Harmony Headlands State Park",
      "Estero Bluffs State Park",
      "Morro Bay State Park",
    ]);
    // China Cove is in Point Lobos, about 5 miles from Monterey.
    expect(lines).toContain(
      "Type: none. Address: Point Lobos State Natural Reserve, 62 CA-1, Carmel, CA 93923, USA. About 16 m and 11.1 miles into the drive. 0.2 miles off the route.",
    );
    expect(lines).toContain("Hours: Friday, May 14, 2027: 8:00 AM – 7:00 PM.");
    expect(textOf(reply)).not.toContain("Left out");
  });

  it("leaves out places within the end distance of either end, and says how many", async () => {
    const planning = plannedDay2();
    const { search } = await searchFor(planning.trip, ATTRACTIONS);
    const reply = await search({
      dayId: planning.day2.id,
      query: "tourist attraction",
    });
    // Old Fisherman's Wharf is in Monterey, and Visit SLO in San Luis Obispo.
    expect(namesIn(reply)).toEqual([
      "Carmel by the sea",
      "Point Sur Lighthouse Vista Point",
    ]);
    expect(textOf(reply).split("\n").slice(-2)).toEqual([
      "",
      "Left out: 2 places within 2 miles of either end of the drive.",
    ]);
  });

  it("gives how far a place is off the route, as the crow flies to the route line's nearest point", async () => {
    // Carmel Valley Village, inland from Carmel, up a valley road.
    const planning = plannedDay2();
    const body = JSON.stringify({
      places: [
        {
          id: "ChIJcarmelvalley",
          displayName: { text: "Carmel Valley Village" },
          formattedAddress: "Carmel Valley, CA 93924, USA",
          location: { latitude: 36.4822, longitude: -121.7322 },
        },
      ],
    });
    const { search } = await searchFor(planning.trip, body);
    const reply = await search({ dayId: planning.day2.id, query: "village" });
    expect(textOf(reply)).toContain(
      "Address: Carmel Valley, CA 93924, USA. About 12 m and 8.2 miles into the drive. 10.6 miles off the route.",
    );
  });

  it("leaves out the trip's rejected places, and says how many", async () => {
    const planning = plannedDay2();
    planning.services.rejections.rejectPlaces(planning.itinerary, [
      new RejectedPlace({
        place: examplePlace({
          name: "Harmony Headlands",
          googlePlaceId: HARMONY_GOOGLE_ID,
        }),
        reason: "too windy",
      }),
    ]);
    const { search } = await searchFor(planning.trip, STATE_PARKS);
    const reply = await search({
      dayId: planning.day2.id,
      query: "state park",
    });
    expect(namesIn(reply)).not.toContain("Harmony Headlands State Park");
    expect(textOf(reply)).toContain(
      "Left out: 1 place the user rejected for this trip.",
    );
  });

  it("refuses a day that starts and ends at the same stay, without calling Google", async () => {
    const { trip, calendar } = moabExample();
    const itinerary = trip.itinerary;
    const day = present(
      itinerary.days.find((each) => calendar.isStayingPut(itinerary, each)),
    );
    const { search, sent } = await searchFor(trip, STATE_PARKS);
    const reply = await search({ dayId: day.id, query: "arches" });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      `Day ${String(calendar.orderOf(itinerary, day) + 1)} (${day.id}) starts and ends at the same stay, so nothing on it is along a leg. Search near the stay with search_near.`,
    );
    expect(sent).toEqual([]);
  });

  it("refuses a day with no route yet", async () => {
    const fixture = setUp();
    const { id: tripId } = await fixture.writer.startTrip({
      id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f",
    });
    const trip = await fixture.reader.read(tripId);
    const dayId = trip.itinerary.lastDay.id;
    const { search } = await searchFor(trip, STATE_PARKS);
    const reply = await search({ dayId, query: "park" });
    expect(textOf(reply)).toBe(
      `Day 1 (${dayId}) has no route yet, since the trip's start place or end place isn't set.`,
    );
  });

  it("says so when Google finds nothing", async () => {
    const planning = plannedDay2();
    const { search } = await searchFor(planning.trip, "{}");
    const reply = await search({ dayId: planning.day2.id, query: "igloos" });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply)).toBe(
      `Google found no places for "igloos" along Day 2's drive (${planning.day2.id}), from Monterey to San Luis Obispo.`,
    );
  });
});
