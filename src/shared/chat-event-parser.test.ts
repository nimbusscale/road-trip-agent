import { describe, expect, it } from "vitest";

import { ChatEventParser } from "./chat-event-parser.js";

describe("ChatEventParser", () => {
  it("keeps an event cut off at the end of a chunk until the rest arrives", () => {
    const parser = new ChatEventParser();
    expect(
      parser.push(
        'event: text\ndata: {"text":"Hello!"}\n\nevent: thinking\ndata: {"te',
      ),
    ).toEqual([{ name: "text", data: { text: "Hello!" } }]);
    expect(parser.push('xt":"Hmm."}\n\n')).toEqual([
      { name: "thinking", data: { text: "Hmm." } },
    ]);
  });

  it("joins the data lines of a text with line breaks", () => {
    const parser = new ChatEventParser();
    expect(parser.push('event: text\ndata: {"text":\ndata: "Hi"}\n\n')).toEqual(
      [{ name: "text", data: { text: "Hi" } }],
    );
  });
});
