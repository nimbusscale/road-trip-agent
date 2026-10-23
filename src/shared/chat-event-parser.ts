import {
  type ChatEvent,
  chatEventSchema,
  chatEventSchemas,
} from "./session.schema.js";

// Reads a reply's Server-Sent Events as they arrive (systems design section 4). The
// browser uses it, and so do the API's tests. Text arrives in chunks that can end
// partway through an event, so the rest is kept for the next chunk.
export class ChatEventParser {
  #rest = "";

  push(chunk: string): ChatEvent[] {
    const blocks = (this.#rest + chunk).split("\n\n");
    this.#rest = blocks.pop() ?? "";
    return blocks.flatMap((block) => {
      const event = eventOf(block);
      return event === null ? [] : [event];
    });
  }
}

// Null for an event the chat doesn't use. Data that doesn't match its event's schema
// throws.
function eventOf(block: string): ChatEvent | null {
  let name = "";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      name = line.slice("event: ".length);
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice("data: ".length));
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  const data: unknown = JSON.parse(dataLines.join("\n"));
  return Object.hasOwn(chatEventSchemas, name)
    ? chatEventSchema.parse({ name, data })
    : null;
}
