import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  at,
  lodgeAt,
  meal,
  OWNER,
  PLANNED_AT,
  planningFor,
  EXAMPLE_SETTINGS,
} from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import {
  placeAt,
  SAN_LUIS_OBISPO,
  sanFranciscoDay2,
} from "../domain/legs.fake.js";
import { examplePlace } from "../domain/place.fake.js";
import { RejectedPlace } from "../domain/rejected-place.js";
import { newTrip, type Trip } from "../domain/trip.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { fakePlacesAccess } from "./places-session.fake.js";
import { searchNearTool } from "./search-near-tool.js";
import { storeTrip, textOf } from "./stored-trip.fake.js";
import type { ToolReply } from "./tool-reply.js";

// Google's answers for hotels and for tri-tip near San Luis Obispo, on 2026-10-26, cut
// down to a few places (DEVELOPMENT.md section 5).
function savedResponse(name: "near-slo-hotels" | "near-slo-tri-tip"): string {
  return readFileSync(
    new URL(`../google/saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

const LA_QUINTA_GOOGLE_ID = "ChIJJ2oN6zzx7IARcmLTRboAx8s";

// San Francisco Day 2 (domain model 5.1), from Monterey to San Luis Obispo on Friday,
// May 14, 2027, with dinner near the San Luis Obispo stay at 6:30, stargazing after
// midnight, and a stop along the leg. Day 1 has coffee near the start place.
function planned(): ReturnType<typeof sanFranciscoDay2> {
  const planning = sanFranciscoDay2();
  const { itinerary, services, day2 } = planning;
  const sanLuisObispo = present(itinerary.stays[1]);
  services.stops.addStops(
    itinerary,
    day2,
    [
      meal({ purpose: "walk", searchArea: "alongLeg" }),
      meal({
        purpose: "tri-tip",
        searchArea: "nearStay",
        stay: sanLuisObispo,
        setTime: at("18:30"),
      }),
      meal({
        purpose: "a late bite",
        searchArea: "nearStay",
        stay: sanLuisObispo,
        setTime: at("01:00", true),
      }),
    ],
    day2.stops.at(-1) ?? null,
  );
  services.stops.addStops(
    itinerary,
    present(itinerary.days[0]),
    [meal({ purpose: "coffee", searchArea: "nearStartPlace" })],
    null,
  );
  return planning;
}

interface Search {
  search: (input: unknown) => Promise<ToolReply>;
  // Each request body sent to Google.
  sent: unknown[];
  fixture: ReturnType<typeof setUp>;
}

async function searchFor(trip: Trip, body: string): Promise<Search> {
  const fixture = setUp();
  await storeTrip(fixture, trip);
  const sent: unknown[] = [];
  const fetchFake: typeof fetch = (url, init) => {
    sent.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
    return Promise.resolve(new Response(body));
  };
  const session = {
    ...fakePlacesAccess(fixture, fetchFake),
    tripId: trip.id,
  };
  const tool = searchNearTool(session);
  return { search: (input) => tool.handler(input), sent, fixture };
}

function stopWithPurpose(
  planning: ReturnType<typeof sanFranciscoDay2>,
  purpose: string,
): string {
  const stops = planning.itinerary.days.flatMap((day) => day.stops);
  return present(stops.find((stop) => stop.purpose === purpose)).id;
}

describe("search_near", () => {
  it("searches around a stay's town, favoring places within the near distance, and gives hours for each of the stay's dates", async () => {
    const planning = planned();
    const stay = present(planning.itinerary.stays[1]);
    const { search, sent, fixture } = await searchFor(
      planning.trip,
      savedResponse("near-slo-hotels"),
    );
    const reply = await search({ stopOrStayId: stay.id, query: "hotels" });
    expect(reply.isError).toBeUndefined();
    expect(sent).toEqual([
      {
        textQuery: "hotels",
        pageSize: 10,
        locationBias: {
          circle: {
            center: { latitude: 35.2828, longitude: -120.6596 },
            radius: 15 * 1609.344,
          },
        },
      },
    ]);
    const laQuinta = present(
      fixture.store.places.rows.find(
        (row) => row.place.googlePlaceId === LA_QUINTA_GOOGLE_ID,
      ),
    ).place;
    const lines = textOf(reply).split("\n");
    expect(lines.slice(0, 7)).toEqual([
      `Places for "hotels" around San Luis Obispo (${stay.place.id}), best match first. Hours are for Friday, May 14, 2027 to Saturday, May 15, 2027.`,
      "",
      `La Quinta Inn & Suites by Wyndham San Luis Obispo Downtown (${laQuinta.id})`,
      "Type: Hotel. Address: 1845 Monterey St, San Luis Obispo, CA 93401, USA. 0.6 miles away.",
      "Rating: 4.5 stars from 806 reviews. Price level: not listed.",
      "Hours: Friday, May 14, 2027: Open 24 hours. Saturday, May 15, 2027: Open 24 hours.",
      `Links: ${laQuinta.links.join(" ")}`,
    ]);
    expect(lines[7]).toBe('<place_content source="Google">');
    expect(lines).toContain(
      "Hours: Friday, May 14, 2027: 7:00 AM – 9:00 PM. Saturday, May 15, 2027: 7:00 AM – 9:00 PM.",
    );
    // Hotel San Luis Obispo has no hours on Google.
    expect(lines).toContain("Hours: not listed");
    expect(textOf(reply)).not.toContain("Left out");
  });

  it("searches around the stay's lodging once one is selected", async () => {
    const planning = planned();
    const stay = present(planning.itinerary.stays[1]);
    const hotel = placeAt("Hotel Cerro", 35.2797, -120.6631);
    lodgeAt(planning, stay, hotel);
    const { search, sent } = await searchFor(
      planning.trip,
      savedResponse("near-slo-hotels"),
    );
    const reply = await search({ stopOrStayId: stay.id, query: "hotels" });
    expect(sent).toMatchObject([
      {
        locationBias: {
          circle: { center: { latitude: 35.2797, longitude: -120.6631 } },
        },
      },
    ]);
    expect(textOf(reply)).toContain(`around Hotel Cerro (${hotel.id})`);
  });

  it("gives a stop near a stay hours for its date only", async () => {
    const planning = planned();
    const { search } = await searchFor(
      planning.trip,
      savedResponse("near-slo-tri-tip"),
    );
    const reply = await search({
      stopOrStayId: stopWithPurpose(planning, "tri-tip"),
      query: "tri-tip",
    });
    const lines = textOf(reply).split("\n");
    expect(lines[0]).toMatch(
      /^Places for "tri-tip" around San Luis Obispo \(place_\w+\), best match first\. Hours are for Friday, May 14, 2027\.$/,
    );
    expect(lines).toContain(
      "Hours: Friday, May 14, 2027: 11:00 AM – 10:00 PM.",
    );
    expect(lines).toContain("Hours: Friday, May 14, 2027: 11:00 AM – 2:00 AM.");
  });

  // Google lists hours that run past midnight on the day they open, so a place open at
  // 1 a.m. Saturday shows it on Friday's line.
  it("gives a stop set after midnight the hours of its day and of the next day, when it falls", async () => {
    const planning = planned();
    const { search } = await searchFor(
      planning.trip,
      savedResponse("near-slo-tri-tip"),
    );
    const reply = await search({
      stopOrStayId: stopWithPurpose(planning, "a late bite"),
      query: "late night food",
    });
    const lines = textOf(reply).split("\n");
    expect(lines[0]).toMatch(
      /Hours are for Friday, May 14, 2027 to Saturday, May 15, 2027\. Google lists hours that run past midnight on the day they open\.$/,
    );
    expect(lines).toContain(
      "Hours: Friday, May 14, 2027: 11:00 AM – 10:00 PM. Saturday, May 15, 2027: 11:00 AM – 10:00 PM.",
    );
    expect(lines).toContain(
      "Hours: Friday, May 14, 2027: 11:00 AM – 2:00 AM. Saturday, May 15, 2027: 11:00 AM – 2:00 AM.",
    );
  });

  it("searches around the start place for a stop near it", async () => {
    const planning = planned();
    const { search, sent } = await searchFor(
      planning.trip,
      savedResponse("near-slo-tri-tip"),
    );
    const reply = await search({
      stopOrStayId: stopWithPurpose(planning, "coffee"),
      query: "coffee",
    });
    expect(sent).toMatchObject([
      {
        locationBias: {
          circle: { center: { latitude: 37.7749, longitude: -122.4194 } },
        },
      },
    ]);
    expect(textOf(reply)).toContain("around San Francisco");
    expect(textOf(reply)).toContain("Hours are for Thursday, May 13, 2027.");
  });

  it("leaves out the trip's rejected places, and says how many", async () => {
    const planning = planned();
    planning.services.rejections.rejectPlaces(planning.itinerary, [
      new RejectedPlace({
        place: examplePlace({
          name: "La Quinta",
          googlePlaceId: LA_QUINTA_GOOGLE_ID,
        }),
        reason: "too plain",
      }),
    ]);
    const { search } = await searchFor(
      planning.trip,
      savedResponse("near-slo-hotels"),
    );
    const reply = await search({
      stopOrStayId: present(planning.itinerary.stays[1]).id,
      query: "hotels",
    });
    expect(textOf(reply)).not.toContain("La Quinta");
    expect(textOf(reply).split("\n").slice(-2)).toEqual([
      "",
      "Left out: 1 place the user rejected for this trip.",
    ]);
  });

  it("refuses a stop along the leg, naming its day, without calling Google", async () => {
    const planning = planned();
    const { search, sent } = await searchFor(planning.trip, "{}");
    const stopId = stopWithPurpose(planning, "walk");
    const reply = await search({ stopOrStayId: stopId, query: "beach" });
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      `${stopId} is along the leg, so it has no place to search near. Search along its day's drive with search_along_leg and the day ID ${planning.day2.id}.`,
    );
    expect(sent).toEqual([]);
  });

  it("refuses an ID that isn't a stop or stay, and one the trip doesn't have", async () => {
    const planning = planned();
    const { search } = await searchFor(planning.trip, "{}");
    const dayId = planning.day2.id;
    expect(textOf(await search({ stopOrStayId: dayId, query: "x" }))).toBe(
      `${dayId} isn't a stop ID or a stay ID.`,
    );
    expect(
      textOf(await search({ stopOrStayId: "stay_zzzzzzzz", query: "x" })),
    ).toBe("This trip has no stay stay_zzzzzzzz.");
  });

  it("gives no hours before the trip has a start date, and says why", async () => {
    const planning = planningFor(newTrip(OWNER, PLANNED_AT, EXAMPLE_SETTINGS));
    const { itinerary, services } = planning;
    services.itinerary.setStartPlace(itinerary, SAN_LUIS_OBISPO);
    const lunch = meal({ purpose: "lunch", searchArea: "nearStartPlace" });
    services.stops.addStops(itinerary, itinerary.lastDay, [lunch], null);
    const { search } = await searchFor(
      planning.trip,
      savedResponse("near-slo-tri-tip"),
    );
    const lines = textOf(
      await search({ stopOrStayId: lunch.id, query: "tri-tip" }),
    ).split("\n");
    expect(lines[0]).toMatch(
      /best match first\. The trip has no start date yet, so no hours are given\.$/,
    );
    expect(lines.filter((line) => line.startsWith("Hours"))).toEqual([]);
  });

  it("says so when Google finds nothing", async () => {
    const planning = planned();
    const stay = present(planning.itinerary.stays[1]);
    const { search } = await searchFor(planning.trip, "{}");
    const reply = await search({ stopOrStayId: stay.id, query: "igloos" });
    expect(reply.isError).toBeUndefined();
    expect(textOf(reply)).toBe(
      `Google found no places for "igloos" around San Luis Obispo (${stay.place.id}).`,
    );
  });
});
