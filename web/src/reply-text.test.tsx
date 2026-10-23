import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReplyText } from "./reply-text";

function html(text: string): string {
  return renderToStaticMarkup(<ReplyText text={text} />);
}

describe("ReplyText", () => {
  // The coordinator often writes one bold label per line, with no list marks.
  it("keeps each line of a paragraph on its own line", () => {
    expect(
      html(
        "**Focus:** Austin to Big Bend\n**Length:** 5 days\n**Start:** May 1",
      ),
    ).toBe(
      '<div class="card reply formatted"><p><strong>Focus:</strong> Austin to Big Bend<br/>\n' +
        "<strong>Length:</strong> 5 days<br/>\n" +
        "<strong>Start:</strong> May 1</p></div>",
    );
  });

  it("keeps the line breaks in a list item", () => {
    expect(html("1. Austin\n   Leave at 8")).toBe(
      '<div class="card reply formatted"><ol>\n<li>Austin<br/>\nLeave at 8</li>\n</ol></div>',
    );
  });

  it("leaves a code block as written", () => {
    expect(html("```\nline one\nline two\n```")).toBe(
      '<div class="card reply formatted"><pre><code>line one\nline two\n</code></pre></div>',
    );
  });
});
