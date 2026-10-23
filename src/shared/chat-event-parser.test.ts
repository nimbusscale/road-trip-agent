import { describe, expect, it } from "vitest";

import { ChatEventParser } from "./chat-event-parser.js";

describe("ChatEventParser", () => {
  it("keeps an event cut off at the end of a chunk until the rest arrives", () => {
    const parser = new ChatEventParser();
    expect(
      parser.push(
        'event: text\ndata: {"text":"Hello!"}\n\nevent: ended\ndata: {"succ',
      ),
    ).toEqual([{ name: "text", data: { text: "Hello!" } }]);
    expect(parser.push('eeded":true}\n\n')).toEqual([
      { name: "ended", data: { succeeded: true } },
    ]);
  });

  it("joins the data lines of a text with line breaks", () => {
    const parser = new ChatEventParser();
    expect(parser.push('event: text\ndata: {"text":\ndata: "Hi"}\n\n')).toEqual(
      [{ name: "text", data: { text: "Hi" } }],
    );
  });
});
