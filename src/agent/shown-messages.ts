import type { ShownMessage } from "../shared/session.schema.js";
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
      last.text = `${last.text}\n\n${text}`;
    } else {
      messages.push({
        role,
        text: role === "user" ? withoutAppLines(text) : text,
      });
    }
  }
  return messages;
}
