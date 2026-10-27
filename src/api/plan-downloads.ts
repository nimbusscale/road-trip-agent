import type { Settings } from "../config/settings.schema.js";
import type { Trip } from "../domain/trip.js";
import { wholeLines } from "../tools/itinerary-lines.js";
import { readContextOf } from "../tools/read-context.js";
import { tripBriefLines } from "../tools/trip-brief-tools.js";

// The trip brief and the itinerary, for the user to download from the chat view, as
// text the coordinator could read (functional spec 10.1). Each starts with what
// read_trip_brief returns, then the whole itinerary from the lines read_itinerary
// builds:
//
// - plan: each stay and day at the "slim" detail, as a whole read gives them.
// - full: each at the "full" detail, as a read scoped to a stay gives them.
//
// Unlike a read, a download has no size limit. It marks check results new or already
// known the same way, and saves nothing either, so the coordinator's next read is the
// same.

export type PlanDetail = "slim" | "full";

export function planTextOf(
  trip: Trip,
  settings: Settings,
  now: () => Date,
  detail: PlanDetail,
): string {
  const context = readContextOf(trip, settings, now);
  const lines = [
    ...tripBriefLines(trip.tripBrief),
    "",
    ...wholeLines(context, detail),
  ];
  return `${lines.join("\n")}\n`;
}
