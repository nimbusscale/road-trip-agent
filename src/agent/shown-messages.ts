import {
  REPLY_PART_SEPARATOR,
  type ShownMessage,
} from "../shared/session.schema.js";
import { withoutAppLines } from "./app-lines.js";
import { shownLineSchema } from "./shown-line.schema.js";

// The conversation as the browser shows it, from the coordinator's transcript lines: the
// user's own words, without the app's lines, and the coordinator's text. One reply can
// span several lines, such as text before and after a tool call, so text in a row is
// joined into one message, as the browser shows it while it streams.
export function shownMessagesOf(lines: readonly unknown[]): ShownMessage[] {
  const messages: ShownMessage[] = [];
  for (const line of lines) {
    const parsed = shownLineSchema.safeParse(line);
    if (!parsed.success || parsed.data.text === "") {
      continue;
    }
    const { role, text } = parsed.data;
    const last = messages.at(-1);
    if (role === "coordinator" && last?.role === "coordinator") {
      last.text = `${last.text}${REPLY_PART_SEPARATOR}${text}`;
    } else {
      messages.push({
        role,
        text: role === "user" ? withoutAppLines(text) : text,
      });
    }
  }
  return messages;
}

// The user messages in the coordinator's transcript lines, as the browser shows them.
// So the next turn is this plus one, and an evaluation finds that turn's message in the
// transcript by the same count (persistence design, section 8.9).
export function userMessageCount(lines: readonly unknown[]): number {
  return userMessageLinesOf(lines).length;
}

// For evaluation tooling: where turn `turn`'s user message is in the coordinator's
// transcript lines, counted as userMessageCount() counts them. The message has to end
// with the words its trip version saved, after any lines the app added. If it doesn't,
// the count no longer matches the one the version was saved with, so this throws rather
// than pair the version with the wrong moment (persistence design, section 8.9).
export function turnMessageIndex(
  lines: readonly unknown[],
  turn: number,
  userMessage: string,
): number {
  if (userMessage === "") {
    throw new Error(
      `Turn ${String(turn)}'s trip version has no user message, so its place in the transcript can't be checked.`,
    );
  }
  const found = userMessageLinesOf(lines)[turn - 1];
  if (found === undefined) {
    throw new Error(`The transcript has no turn ${String(turn)}.`);
  }
  if (found.text !== userMessage && !found.text.endsWith(`\n${userMessage}`)) {
    throw new Error(
      `Turn ${String(turn)}'s message in the transcript isn't the one its trip version saved.`,
    );
  }
  return found.index;
}

// Each user message the browser shows, with its line's place in the list, and its text
// as stored, with the app's lines.
function userMessageLinesOf(
  lines: readonly unknown[],
): { index: number; text: string }[] {
  return lines.flatMap((line, index) => {
    const parsed = shownLineSchema.safeParse(line);
    return parsed.success &&
      parsed.data.role === "user" &&
      parsed.data.text !== ""
      ? [{ index, text: parsed.data.text }]
      : [];
  });
}
