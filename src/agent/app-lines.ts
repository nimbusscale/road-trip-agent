import type { CalendarDate } from "../domain/calendar-date.js";
import type { OptionCardIds } from "../shared/session.schema.js";

export const RESUMED_LINE =
  "This session was resumed. Read the trip brief, the itinerary, and memory first.";

export const FORGOTTEN_LINE =
  "The user forgot memory items in the app, outside this chat. Read memory again, and stop using any item that's gone.";

export const OPTION_CARD_LINE_START = "From an option card:";

// The lines the app adds to the start of user messages (technical spec 5.2). Today's
// date goes on the first message of a conversation, and on any message whose date
// differs from the last one it went on. It can go back a day: in a US evening, the UTC
// date given before the trip has a start place is a day ahead of the start place's. The resumed line goes on the first message after a
// resume, and the forgotten line on the first message after the user forgets memory
// items in the chat view. One per conversation: a resume starts a new one. A message
// sent from an option card gets the card's IDs (technical spec 7.2).
export class AppLines {
  #lastDate: CalendarDate | null = null;
  #resumedLinePending: boolean;
  #forgottenLinePending = false;
  #recordedLines: readonly string[] | null = null;

  constructor(resumed: boolean) {
    this.#resumedLinePending = resumed;
  }

  // For a run from a recorded turn (#245): the first message gets exactly the recorded
  // turn's lines, and none of the app's own, so the coordinator can't tell the run from
  // the recorded session.
  static recorded(lines: readonly string[]): AppLines {
    const appLines = new AppLines(false);
    appLines.#recordedLines = lines;
    return appLines;
  }

  markMemoryForgotten(): void {
    this.#forgottenLinePending = true;
  }

  addTo(
    text: string,
    today: CalendarDate,
    optionCard: OptionCardIds | null,
  ): string {
    if (this.#recordedLines !== null) {
      const recorded = this.#recordedLines;
      this.#recordedLines = null;
      return withLines(recorded, text);
    }
    const lines: string[] = [];
    if (this.#lastDate === null || today.compareTo(this.#lastDate) !== 0) {
      lines.push(dateLine(today.longText));
      this.#lastDate = today;
    }
    if (this.#resumedLinePending) {
      lines.push(RESUMED_LINE);
      this.#resumedLinePending = false;
    }
    if (this.#forgottenLinePending) {
      lines.push(FORGOTTEN_LINE);
      this.#forgottenLinePending = false;
    }
    if (optionCard !== null) {
      lines.push(optionCardLine(optionCard));
    }
    return withLines(lines, text);
  }
}

// The app's lines, then a blank line, then the user's own words.
function withLines(lines: readonly string[], text: string): string {
  return lines.length === 0 ? text : [...lines, "", text].join("\n");
}

// Such as "For planning this trip, today's date is Sunday, October 10, 2027." It names
// the trip, so it doesn't read like Claude Code's own date line, which a run from a
// recorded turn can't match (technical spec 5.2).
export function dateLine(longDate: string): string {
  return `${DATE_LINE_START}${longDate}.`;
}

// Such as "From an option card: stop_k7m2x9qa, place_p3w8n4rt."
function optionCardLine({ holderId, placeId }: OptionCardIds): string {
  const ids = placeId === null ? [holderId] : [holderId, placeId];
  return `${OPTION_CARD_LINE_START} ${ids.join(", ")}.`;
}

const DATE_LINE_START = "For planning this trip, today's date is ";

// A date as longText gives it, such as "Sunday, October 10, 2027".
const LONG_DATE = String.raw`[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}`;

const DATE_LINE = new RegExp(String.raw`^${DATE_LINE_START}${LONG_DATE}\.$`);

// The date line's wording before #245, such as "Today is Sunday, October 10, 2027."
// Sessions started before then keep it in their earlier messages.
const OLD_DATE_LINE = new RegExp(String.raw`^Today is ${LONG_DATE}\.$`);

const OPTION_CARD_LINE = /^From an option card: [a-z0-9_, ]+\.$/;

function isAppLine(line: string): boolean {
  return (
    line === RESUMED_LINE ||
    line === FORGOTTEN_LINE ||
    DATE_LINE.test(line) ||
    OLD_DATE_LINE.test(line) ||
    OPTION_CARD_LINE.test(line)
  );
}

// The lines the app added to the start of a stored message, and the user's own words
// after them. A message with no app lines has none.
export function appLinesOf(message: string): {
  lines: string[];
  ownWords: string;
} {
  const lines = message.split("\n");
  const firstOwn = lines.findIndex((line) => !isAppLine(line));
  // The app's lines are followed by one blank line.
  if (firstOwn <= 0 || lines[firstOwn] !== "") {
    return { lines: [], ownWords: message };
  }
  return {
    lines: lines.slice(0, firstOwn),
    ownWords: lines.slice(firstOwn + 1).join("\n"),
  };
}

// The user's own words from a stored message, without the lines the app added, for
// showing a resumed session. A message with no app lines comes back as it is.
export function withoutAppLines(message: string): string {
  return appLinesOf(message).ownWords;
}
