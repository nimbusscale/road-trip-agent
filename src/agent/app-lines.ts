import type { CalendarDate } from "../domain/calendar-date.js";

export const RESUMED_LINE =
  "This session was resumed. Read the trip brief, the itinerary, and memory first.";

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

// Such as "Today is Sunday, October 10, 2027."
const DATE_LINE = /^Today is [A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}\.$/;

// The user's own words from a stored message, without the lines the app added, for
// showing a resumed session. A message with no app lines comes back as it is.
export function withoutAppLines(message: string): string {
  const lines = message.split("\n");
  const firstOwn = lines.findIndex(
    (line) => line !== RESUMED_LINE && !DATE_LINE.test(line),
  );
  // The app's lines are followed by one blank line.
  if (firstOwn <= 0 || lines[firstOwn] !== "") {
    return message;
  }
  return lines.slice(firstOwn + 1).join("\n");
}
