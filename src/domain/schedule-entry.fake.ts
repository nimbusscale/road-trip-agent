import type { ScheduleEntry } from "./schedule-entry.js";
import type { ScheduleTime } from "./schedule-time.js";

// Such as "8:25 a.m." or "1:00 a.m., next day", as the example trips show times.
export function timeText(time: ScheduleTime | null): string | null {
  if (time === null) {
    return null;
  }
  const { hours, minutes } = time.time;
  const hour = String(hours % 12 === 0 ? 12 : hours % 12);
  const text = `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "a.m." : "p.m."}`;
  return time.isNextDay ? `${text}, next day` : text;
}

// Such as "drive: 8:00 p.m. to 8:06 p.m.", or "stop lunch: null to null" for a stop
// with no place and no time. A stop is named by its selected place, or its purpose.
export function describeEntry(entry: ScheduleEntry): string {
  const name = entry.stop?.selectedPlace?.name ?? entry.stop?.purpose;
  const label = name === undefined ? entry.kind : `${entry.kind} ${name}`;
  return `${label}: ${String(timeText(entry.startTime))} to ${String(timeText(entry.endTime))}`;
}
