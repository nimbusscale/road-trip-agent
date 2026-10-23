import { CalendarDate } from "../domain/calendar-date.js";
import type { Place } from "../domain/place.js";
import { todayAt } from "../domain/today.js";

// Technical spec 5.2 adds the itinerary to this line. The coordinator can't read it
// yet, so #54 adds it, with read_itinerary.
export const RESUMED_LINE =
  "This session was resumed. Read the trip brief and memory first.";

// Today's date for the coordinator: at the start place, since that is where the trip
// begins, and in UTC until the trip has one (technical spec 5.2).
export function coordinatorToday(
  startPlace: Place | null,
  now: Date,
): CalendarDate {
  if (startPlace !== null) {
    return todayAt(startPlace, now);
  }
  return new CalendarDate(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}

// The lines the app adds to the start of user messages (technical spec 5.2). Today's
// date goes on the first message of a conversation, and on any message on a later date
// than the last one it went on. The resumed line goes on the first message after a
// resume. One per conversation: a resume starts a new one.
export class AppLines {
  #lastDate: CalendarDate | null = null;
  #resumedLinePending: boolean;

  constructor(resumed: boolean) {
    this.#resumedLinePending = resumed;
  }

  addTo(text: string, today: CalendarDate): string {
    const lines: string[] = [];
    if (this.#lastDate === null || today.compareTo(this.#lastDate) > 0) {
      lines.push(`Today is ${today.longText}.`);
      this.#lastDate = today;
    }
    if (this.#resumedLinePending) {
      lines.push(RESUMED_LINE);
      this.#resumedLinePending = false;
    }
    return lines.length === 0 ? text : [...lines, "", text].join("\n");
  }
}
