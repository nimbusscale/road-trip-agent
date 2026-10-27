import type { ShownEntry } from "../../src/shared/itinerary.schema";

// A stop's arrival and end, or one time for one that takes none. A stop with no
// selected place and no set time has no time yet (domain model 4.1).
export function timesText(entry: ShownEntry): string {
  const { startTime, endTime } = entry;
  if (startTime === null) {
    return entry.stop === null ? "" : "Time set once a place is picked";
  }
  return endTime === null || endTime === startTime
    ? startTime
    : `${startTime} – ${endTime}`;
}

export function countText(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
