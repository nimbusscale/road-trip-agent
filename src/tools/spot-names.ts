import { placeText } from "../domain/check-text.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";
import { dayNumber } from "./day-lines.js";
import type { ReadContext } from "./read-context.js";

// How a tool names the stop or stay where a place sits, the same way in each tool:
// find_in_trip's line for each spot, and select_user_place's line for each other stop
// or stay where the place is a candidate (tool design 2.1). Days, stops, and stays are
// counted from 1, as people count them (domain model section 1).

export type Positions = Pick<ReadContext, "itinerary" | "calendar">;

// Such as 'Day 12, Stop 5 (stop_…), attraction: "the east end of the South Rim"', as
// the read's stop line names it.
export function stopName(positions: Positions, stop: Stop): string {
  const { itinerary, calendar } = positions;
  const day = calendar.dayOf(itinerary, stop);
  const order = calendar.orderOf(itinerary, stop);
  return `${dayNumber(positions, day)}, Stop ${String(order + 1)} (${stop.id}), ${stop.kind}: "${stop.purpose}"`;
}

// Such as "Stay 1, Springdale (stay_…)".
export function stayName(positions: Positions, stay: Stay): string {
  return `${stayNumber(positions, stay)}, ${placeText(stay.place)} (${stay.id})`;
}

// Such as "Stay 1".
export function stayNumber(positions: Positions, stay: Stay): string {
  const order = positions.calendar.orderOf(positions.itinerary, stay);
  return `Stay ${String(order + 1)}`;
}
