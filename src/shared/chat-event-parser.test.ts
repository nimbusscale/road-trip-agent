import { describe, expect, it } from "vitest";

import { ChatEventParser } from "./chat-event-parser.js";

describe("ChatEventParser", () => {
  it("keeps an event cut off at the end of a chunk until the rest arrives", () => {
    const parser = new ChatEventParser();
    expect(
      parser.push(
        'event: text\ndata: {"text":"Hello!"}\n\nevent: toolCall\ndata: {"na',
      ),
    ).toEqual([{ name: "text", data: { text: "Hello!" } }]);
    expect(parser.push('me":"mcp__trip__read_itinerary"}\n\n')).toEqual([
      { name: "toolCall", data: { name: "mcp__trip__read_itinerary" } },
    ]);
  });

  it("joins the data lines of a text with line breaks", () => {
    const parser = new ChatEventParser();
    expect(parser.push('event: text\ndata: {"text":\ndata: "Hi"}\n\n')).toEqual(
      [{ name: "text", data: { text: "Hi" } }],
    );
  });
});
