import { type Context, Hono } from "hono";

import type { Place } from "../domain/place.js";
import type { Trip } from "../domain/trip.js";
import type { ChatDependencies } from "./chat-dependencies.js";
import { ownedTrip } from "./owned.js";
import { readablePlanOf, storedPlanOf } from "./plan-downloads.js";

// The trip brief and the itinerary as a file, in each of its two forms
// (plan-downloads.ts). Each is JSON on several lines, indented, so a person can read it.
// They're reads, so they work on a started trip too.
export function planDownloadRoutes(chat: ChatDependencies): Hono {
  const routes = new Hono();

  routes.get("/trips/:tripId/plan/stored", (context) =>
    download(context, chat, storedPlanOf),
  );

  routes.get("/trips/:tripId/plan/readable", (context) =>
    download(context, chat, readablePlanOf),
  );

  return routes;
}

async function download(
  context: Context,
  chat: ChatDependencies,
  documentOf: (trip: Trip, places: readonly Place[]) => unknown,
): Promise<Response> {
  const trip = await ownedTrip(
    chat.trips.reader,
    context.req.param("tripId") ?? "",
    context.get("user"),
  );
  const places = await chat.trips.reader.readPlaces(trip.id);
  const text = `${JSON.stringify(documentOf(trip, places), null, 2)}\n`;
  return context.body(text, 200, { "Content-Type": "application/json" });
}
