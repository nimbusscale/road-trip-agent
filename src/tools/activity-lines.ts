import type { Calendar } from "../domain/calendar.js";
import { clockText, placeText, sentence } from "../domain/check-text.js";
import {
  minuteOfScheduleTime,
  MINUTES_IN_DAY,
} from "../domain/day-timeline.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { ScheduleEntry } from "../domain/schedule-entry.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";

// A stay's activities, as read_worker_brief_facts gives them under the stay's line (tool
// design 2.1): its attraction stops, by the weather rule (technical spec 6.3), in the
// days' order. Each with its place, or its purpose when it has none, and its date and
// time.

export function activityLines(
  calendar: Calendar,
  itinerary: Itinerary,
  stay: Stay,
): string[] {
  const activities = calendar.activitiesOf(itinerary, stay);
  if (activities.length === 0) {
    return ["- The stay has no activities."];
  }
  return [
    "- The stay's activities:",
    ...activities.map((stop) =>
      sentence(
        `  - ${activityName(stop)}: ${activityWhen(calendar, itinerary, stop)}`,
      ),
    ),
  ];
}

function activityName(stop: Stop): string {
  const place = stop.selectedPlace;
  return place === null
    ? `${stop.purpose}, no place picked yet`
    : `${placeText(place)} (${place.id})`;
}

// Such as "Monday, October 11, 2027, 9:00 a.m. to 1:00 p.m.". A time after midnight
// gives the next date, so stargazing at 1 a.m. after Day 4 shows on Day 5's date.
function activityWhen(
  calendar: Calendar,
  itinerary: Itinerary,
  stop: Stop,
): string {
  const day = calendar.dayOf(itinerary, stop);
  const dayDate = calendar.dateOf(itinerary, day);
  const entry = calendar
    .scheduleOf(itinerary, day)
    .find((each) => each.stop === stop);
  const start = entry?.startTime ?? null;
  if (dayDate === null) {
    return "date not known yet";
  }
  if (start === null) {
    return `${dayDate.longText}, time not known yet`;
  }
  const startMinute = minuteOfScheduleTime(start);
  const date = start.isNextDay ? dayDate.plusDays(1) : dayDate;
  const fromMidnight = start.isNextDay ? MINUTES_IN_DAY : 0;
  return `${date.longText}, ${clockText(startMinute - fromMidnight)}${endText(entry, startMinute, fromMidnight)}`;
}

// Empty for a stop that takes no time, such as one with no place picked yet.
function endText(
  entry: ScheduleEntry | undefined,
  startMinute: number,
  fromMidnight: number,
): string {
  const end = entry?.endTime ?? null;
  if (end === null) {
    return "";
  }
  const endMinute = minuteOfScheduleTime(end);
  return endMinute === startMinute
    ? ""
    : ` to ${clockText(endMinute - fromMidnight)}`;
}
