import { type Context, Hono } from "hono";

import type { ChatDependencies } from "./chat-dependencies.js";
import { ownedTrip } from "./owned.js";
import { type PlanDetail, planTextOf } from "./plan-downloads.js";

// The trip brief and the itinerary as a text file, in each of its two details
// (plan-downloads.ts). They're reads, so they work on a started trip too.
export function planDownloadRoutes(chat: ChatDependencies): Hono {
  const routes = new Hono();

  routes.get("/trips/:tripId/plan", (context) =>
    download(context, chat, "slim"),
  );

  routes.get("/trips/:tripId/plan/full", (context) =>
    download(context, chat, "full"),
  );

  return routes;
}

async function download(
  context: Context,
  chat: ChatDependencies,
  detail: PlanDetail,
): Promise<Response> {
  const trip = await ownedTrip(
    chat.trips.reader,
    context.req.param("tripId") ?? "",
    context.get("user"),
  );
  const text = planTextOf(trip, chat.settings, chat.now, detail);
  return context.body(text, 200, {
    "Content-Type": "text/plain; charset=utf-8",
  });
}
