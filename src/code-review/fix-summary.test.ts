import { describe, expect, it } from "vitest";

import { markerLine } from "./fix-markers.js";
import { FIXER_BOT, postedFindings } from "./fix-round.js";
import { summaryBody, tickedIds } from "./fix-summary.js";
import {
  conversationComment,
  finding,
  inlineComment,
  OLD_SHA,
  outsideDiffReview,
  PR_URL,
  prState,
  replyComment,
} from "./fix-test-state.js";

const deferred = `${markerLine("deferred", null, 80)}\n\nIt fits #80.`;
const needsAttention = `${markerLine("needs_attention", null, null)}\n\nIt would undo a decision.`;
const fixed = `${markerLine("fixed", "c".repeat(40), null)}\n\nFixed.`;

const state = prState({
  comments: [
    inlineComment(1, finding("F2", "src/a.ts", 10), OLD_SHA),
    replyComment(2, 1, FIXER_BOT, deferred),
    inlineComment(3, finding("F4", "src/b.ts", 20), OLD_SHA),
    replyComment(4, 3, FIXER_BOT, fixed),
    inlineComment(5, finding("F1", "src/c.ts", 30), OLD_SHA),
    replyComment(6, 5, FIXER_BOT, needsAttention),
  ],
  reviews: [outsideDiffReview(9, [finding("F6", "design/x.md", 47)], OLD_SHA)],
  issueComments: [
    conversationComment(
      20,
      `${needsAttention}\n\n<!-- fix-loop: review-9-1 -->`,
    ),
  ],
});

describe("summaryBody", () => {
  it("lists what's deferred and what needs attention, with links", () => {
    const body = summaryBody(postedFindings(state), [], new Set());

    expect(body).toContain(
      `**Deferred**\n\n- The F2 problem in src/a.ts (\`src/a.ts:10\`): [finding](${PR_URL}#discussion_r1), [reply](${PR_URL}#discussion_r2), #80`,
    );
    expect(body).toContain(
      `- The F1 problem in src/c.ts (\`src/c.ts:30\`): [finding](${PR_URL}#discussion_r5), [reply](${PR_URL}#discussion_r6)`,
    );
    expect(body).toContain(
      `- [ ] The F6 problem in design/x.md (\`design/x.md:47\`): [finding](${PR_URL}#pullrequestreview-9), [reply](${PR_URL}#issuecomment-20) <!-- fix-loop: review-9-1 -->`,
    );
    expect(body).not.toContain("src/b.ts");
  });

  it("drops a finding once its thread is resolved, and keeps a ticked box ticked", () => {
    const resolved = [
      { threadId: "T1", isResolved: true, firstCommentId: 1 },
      { threadId: "T5", isResolved: false, firstCommentId: 5 },
    ];
    const before = summaryBody(postedFindings(state), [], new Set());
    const ticked = tickedIds(before.replace("- [ ] ", "- [x] "));
    const after = summaryBody(postedFindings(state), resolved, ticked);

    expect(ticked).toEqual(new Set(["review-9-1"]));
    expect(after).toContain("**Deferred**\n\nNone.");
    expect(after).toContain("src/c.ts:30");
    expect(after).toContain("- [x] The F6 problem in design/x.md");
  });

  it("cuts a long first sentence without leaving a code span open", () => {
    const long = {
      ...finding("F2"),
      finding: `The call to \`${"x".repeat(120)}\` is wrong. More.`,
    };
    const longState = prState({
      comments: [
        inlineComment(1, long, OLD_SHA),
        replyComment(2, 1, FIXER_BOT, deferred),
      ],
    });

    const body = summaryBody(postedFindings(longState), [], new Set());

    expect(body).toContain(
      `- The call to \`${"x".repeat(86)}\`… (\`src/a.ts:10\`)`,
    );
  });
});
