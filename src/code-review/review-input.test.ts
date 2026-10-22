import { describe, expect, it } from "vitest";

import { markerLine } from "./fix-markers.js";
import { reviewBodyReply } from "./fix-post.js";
import { FIXER_BOT, JOE, postedFindings } from "./fix-round.js";
import {
  conversationComment,
  FIX_SHA,
  finding,
  inlineComment,
  OLD_SHA,
  outsideDiffReview,
  prState,
  replyComment,
} from "./fix-test-state.js";
import type { PrState } from "./fix-round.js";
import { reviewInputText } from "./review-input-text.js";

const REASON = "The fixer's reason, which the reviewer must not read.";

function reply(outcome: Parameters<typeof markerLine>[0]): string {
  return `${markerLine(outcome, FIX_SHA, 80)}\n\n${REASON}`;
}

function inputFor(state: PrState): string {
  return reviewInputText(7, postedFindings(state));
}

// Each finding's section in the list, by its ID.
function sectionOf(text: string, id: string): string {
  const start = text.indexOf(`## ${id}:`);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("reviewInputText", () => {
  const state = prState({
    comments: [
      inlineComment(1, finding("F2"), OLD_SHA),
      replyComment(2, 1, FIXER_BOT, reply("fixed")),
      inlineComment(3, finding("F4", "src/b.ts", 5), OLD_SHA),
      replyComment(4, 3, FIXER_BOT, reply("deferred")),
      inlineComment(5, finding("F6", "src/c.ts", 7), OLD_SHA),
      replyComment(6, 5, FIXER_BOT, reply("below_the_bar")),
      inlineComment(7, finding("F1", "src/d.ts", 9), OLD_SHA),
      replyComment(8, 7, FIXER_BOT, reply("needs_attention")),
      replyComment(9, 7, JOE, "Fix it anyway, since the decision changed."),
      inlineComment(10, finding("N3", "src/e.ts", 11), OLD_SHA),
    ],
  });
  const text = inputFor(state);

  it("gives each finding its text and place, and never a reply's text", () => {
    expect(sectionOf(text, "comment-1")).toContain(
      "`src/a.ts:10`, Fix (F2), posted on aaaaaaa",
    );
    expect(sectionOf(text, "comment-1")).toContain(
      "The F2 problem in src/a.ts.",
    );
    expect(text).not.toContain(REASON);
    expect(text).not.toContain("decision changed");
  });

  it("says what each marker means for the review", () => {
    expect(sectionOf(text, "comment-1")).toContain(
      `Fixed in ${FIX_SHA}. Check whether the fix worked.`,
    );
    expect(sectionOf(text, "comment-3")).toContain(
      "Deferred to #80, which plans the work. Don't post it again.",
    );
    expect(sectionOf(text, "comment-10")).toContain(
      "No reply yet. Don't post it again, unless the lines it points to have changed",
    );
  });

  it("doesn't say whether a handled finding wasn't fixed or needs attention", () => {
    for (const id of ["comment-5", "comment-7"]) {
      const section = sectionOf(text, id);
      expect(section).toContain("Handled. Don't post it again.");
      expect(section).not.toMatch(/below the bar|wrong|attention/i);
    }
  });

  it("takes a marker from Joe's account, and ignores one from anyone else", () => {
    const byHand = (author: string) =>
      inputFor(
        prState({
          comments: [
            inlineComment(1, finding("F2"), OLD_SHA),
            replyComment(2, 1, author, reply("wrong")),
          ],
        }),
      );

    expect(byHand(JOE)).toContain("Handled. Don't post it again.");
    expect(byHand("a-stranger")).toContain("No reply yet.");
  });

  it("goes by the last marker, so a fix after needs attention is checked", () => {
    const after = inputFor(
      prState({
        comments: [
          inlineComment(1, finding("F2"), OLD_SHA),
          replyComment(2, 1, FIXER_BOT, reply("needs_attention")),
          replyComment(3, 1, JOE, "Fix it."),
          replyComment(4, 1, FIXER_BOT, reply("fixed")),
        ],
      }),
    );

    expect(after).toContain("Check whether the fix worked.");
  });

  it("reads the marker for a finding in a review body from its tagged comment", () => {
    const review = outsideDiffReview(
      9,
      [finding("F6", "design/x.md", 4)],
      OLD_SHA,
    );
    const [posted] = postedFindings(prState({ reviews: [review] }));
    if (posted === undefined) {
      throw new Error("No finding in the review body.");
    }
    const withReply = inputFor(
      prState({
        reviews: [review],
        issueComments: [
          conversationComment(
            20,
            reviewBodyReply(posted, markerLine("deferred", null, 80), REASON),
          ),
        ],
      }),
    );

    expect(sectionOf(withReply, "review-9-1")).toContain("Deferred to #80");
    expect(withReply).not.toContain(REASON);
  });

  it("says when there are no earlier findings", () => {
    expect(inputFor(prState({}))).toContain("None.");
  });
});
