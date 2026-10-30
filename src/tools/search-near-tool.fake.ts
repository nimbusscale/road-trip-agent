import { readFileSync } from "node:fs";

import { at, meal } from "../domain/example-trip-parts.fake.js";
import { present } from "../domain/itinerary.fake.js";
import { sanFranciscoDay2 } from "../domain/legs.fake.js";
import type { Trip } from "../domain/trip.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { fakePlacesAccess } from "./places-session.fake.js";
import { searchNearTool } from "./search-near-tool.js";
import type { MapPoint } from "./search-result-lines.js";
import { storeTrip } from "./stored-trip.fake.js";
import type { ToolReply } from "./tool-reply.js";

// What the search_near tests share: Google's saved answers, the trip they search, and
// the tool over a fake Google (DEVELOPMENT.md section 5).

// Google's answers for hotels and for tri-tip near San Luis Obispo, on 2026-10-26, cut
// down to a few places (DEVELOPMENT.md section 5).
export function savedResponse(
  name: "near-slo-hotels" | "near-slo-tri-tip",
): string {
  return readFileSync(
    new URL(`../google/saved-responses/${name}.json`, import.meta.url),
    "utf8",
  );
}

// A saved answer with the places at the positions given moved somewhere else, or every
// place when no positions are given. The first place is at 0. A query about a style
// alone can bring back places across the country (#233).
export function moved(
  body: string,
  to: MapPoint,
  positions?: readonly number[],
): string {
  // Only a place has a location, and JSON.parse reaches them in order.
  let position = 0;
  const parsed: unknown = JSON.parse(body, (key, value: unknown) => {
    if (key !== "location") {
      return value;
    }
    const at = position;
    position += 1;
    return positions === undefined || positions.includes(at) ? to : value;
  });
  return JSON.stringify(parsed);
}

// San Francisco Day 2 (domain model 5.1), from Monterey to San Luis Obispo on Friday,
// May 14, 2027, with dinner near the San Luis Obispo stay at 6:30, stargazing after
// midnight, and a stop along the leg. Day 1 has coffee near the start place.
export function planned(): ReturnType<typeof sanFranciscoDay2> {
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

export interface Search {
  search: (input: unknown) => Promise<ToolReply>;
  // Each request body sent to Google.
  sent: unknown[];
  fixture: ReturnType<typeof setUp>;
}

export async function searchFor(trip: Trip, body: string): Promise<Search> {
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

export function stopWithPurpose(
  planning: ReturnType<typeof sanFranciscoDay2>,
  purpose: string,
): string {
  const stops = planning.itinerary.days.flatMap((day) => day.stops);
  return present(stops.find((stop) => stop.purpose === purpose)).id;
}
