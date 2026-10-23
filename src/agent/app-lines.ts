import type { CalendarDate } from "../domain/calendar-date.js";

// Technical spec 5.2 adds the itinerary to this line. The coordinator can't read it
// yet, so #54 adds it, with read_itinerary.
export const RESUMED_LINE =
  "This session was resumed. Read the trip brief and memory first.";

// The lines the app adds to the start of user messages (technical spec 5.2). Today's
// date goes on the first message of a conversation, and on any message whose date
// differs from the last one it went on. It can go back a day: in a US evening, the UTC
// date given before the trip has a start place is a day ahead of the start place's. The resumed line goes on the first message after a
// resume. One per conversation: a resume starts a new one.
export class AppLines {
  #lastDate: CalendarDate | null = null;
  #resumedLinePending: boolean;

  constructor(resumed: boolean) {
    this.#resumedLinePending = resumed;
  }

  addTo(text: string, today: CalendarDate): string {
    const lines: string[] = [];
    if (this.#lastDate === null || today.compareTo(this.#lastDate) !== 0) {
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
