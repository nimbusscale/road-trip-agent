import { describe, expect, it } from "vitest";

import { answerProblems } from "./fix-answer.js";
import {
  decisionsComment,
  fixInputText,
  stopReason,
} from "./fix-input-text.js";
import { markerLine, outcomeOf } from "./fix-markers.js";
import { reviewBodyReply } from "./fix-post.js";
import { FIXER_BOT, fixRound, lastOutcome } from "./fix-round.js";
import {
  conversationComment,
  fileComment,
  finding,
  HEAD_SHA,
  inlineComment,
  OLD_SHA,
  outsideDiffReview,
  prState,
  replyComment,
} from "./fix-test-state.js";
import { OUTCOMES } from "./fix-answer.schema.js";

describe("fixRound", () => {
  it("takes this round's findings marked fix from the review of the head", () => {
    const round = fixRound(
      prState({
        comments: [
          inlineComment(1, finding("F2"), HEAD_SHA),
          inlineComment(2, finding("N3"), HEAD_SHA),
          inlineComment(3, finding("V1"), HEAD_SHA),
          fileComment(4, finding("F4", "src/b.ts", 42), HEAD_SHA),
          inlineComment(5, finding("F1"), OLD_SHA),
        ],
      }),
    );

    expect(round.pending.map((f) => [f.id, f.label, f.file, f.line])).toEqual([
      ["comment-1", "F2", "src/a.ts", 10],
      ["comment-4", "F4", "src/b.ts", 42],
    ]);
    expect(round.earlier.map((f) => f.id)).toEqual(["comment-5"]);
    expect(round.pending[0]?.text).toBe(
      "The F2 problem in src/a.ts. More detail.",
    );
    expect(round.pending[0]?.labelReason).toBe("Reason for F2.");
  });

  it("splits a review body into its findings, each with its file and line", () => {
    const round = fixRound(
      prState({
        reviews: [
          outsideDiffReview(
            9,
            [finding("F6", "design/x.md", 47), finding("N6", "design/y.md", 3)],
            HEAD_SHA,
          ),
        ],
      }),
    );

    expect(round.pending).toHaveLength(1);
    expect(round.pending[0]).toMatchObject({
      id: "review-9-1",
      file: "design/x.md",
      line: 47,
      label: "F6",
      threadCommentId: null,
    });
  });

  it("skips comments by anyone but the reviewer, even in its format", () => {
    const byJoe = { ...inlineComment(1, finding("F2"), HEAD_SHA) };
    const round = fixRound(
      prState({ comments: [{ ...byJoe, author: "nimbusscale" }] }),
    );

    expect(round.pending).toEqual([]);
  });

  it("lets the fixer take an earlier finding that needs attention, once Joe replies", () => {
    const needsAttention = `${markerLine("needs_attention", null, null)}\n\nIt would undo a decision.`;
    const state = (joeReplies: boolean) =>
      prState({
        comments: [
          inlineComment(1, finding("F2"), OLD_SHA),
          replyComment(2, 1, FIXER_BOT, needsAttention),
          ...(joeReplies
            ? [replyComment(3, 1, "nimbusscale", "Fix it anyway.")]
            : []),
        ],
      });

    expect(fixRound(state(false)).askable).toEqual([]);
    const round = fixRound(state(true));
    expect(round.askable.map((f) => f.id)).toEqual(["comment-1"]);
    expect(round.earlier.map(lastOutcome)).toEqual(["needs_attention"]);
  });

  it("reads the reply to a review body's finding from its tagged comment", () => {
    const deferred = `${markerLine("deferred", null, 80)}\n\nIt fits #80.\n\n<!-- fix-loop: review-9-1 -->`;
    const round = fixRound(
      prState({
        reviews: [outsideDiffReview(9, [finding("F6")], OLD_SHA)],
        issueComments: [conversationComment(20, deferred)],
      }),
    );

    expect(round.earlier[0]?.replies).toHaveLength(1);
    expect(round.earlier.map(lastOutcome)).toEqual(["deferred"]);
  });

  it("lets Joe ask for a fix on a review body's finding, in a comment that names its ID", () => {
    const [earlier] = fixRound(
      prState({ reviews: [outsideDiffReview(9, [finding("F6")], OLD_SHA)] }),
    ).earlier;
    if (earlier === undefined) {
      throw new Error("No earlier finding.");
    }
    const fixerReply = reviewBodyReply(
      earlier,
      markerLine("needs_attention", null, null),
      "It would undo a decision.",
    );
    const state = prState({
      comments: [inlineComment(1, finding("F2"), HEAD_SHA)],
      reviews: [outsideDiffReview(9, [finding("F6")], OLD_SHA)],
      issueComments: [
        conversationComment(20, fixerReply),
        conversationComment(21, "Leave review-9-10 alone.", "nimbusscale"),
        conversationComment(22, "Fix review-9-1 anyway.", "nimbusscale"),
      ],
    });
    const round = fixRound(state);

    expect(round.askable.map((f) => f.id)).toEqual(["review-9-1"]);
    expect(round.earlier[0]?.replies.map((r) => r.body)).toEqual([
      fixerReply,
      "Fix review-9-1 anyway.",
    ]);
    expect(fixInputText(state.pull, "None.", round)).toContain(
      "Fix review-9-1 anyway.",
    );
    expect(
      answerProblems(
        {
          status: "done",
          commit: null,
          replies: [
            {
              findingId: "comment-1",
              outcome: "wrong",
              issue: null,
              reply: "Why.",
            },
            {
              findingId: "review-9-1",
              outcome: "wrong",
              issue: null,
              reply: "Why.",
            },
          ],
        },
        round,
        {
          local: { head: HEAD_SHA, parent: OLD_SHA, clean: true },
          openIssues: new Set(),
          ownIssues: new Set(),
        },
      ),
    ).toEqual([]);
  });
});

describe("a finding from this round that needs attention", () => {
  // The fixer marked this round's only finding "needs attention", so it pushed nothing,
  // and the head didn't change. Then Joe replied.
  const needsAttention = `${markerLine("needs_attention", null, null)}\n\nIt would undo a decision.`;
  const state = (joeReplies: boolean) =>
    prState({
      comments: [
        inlineComment(1, finding("F5"), HEAD_SHA),
        replyComment(2, 1, FIXER_BOT, needsAttention),
        ...(joeReplies
          ? [replyComment(3, 1, "nimbusscale", "Fix it here.")]
          : []),
      ],
    });

  it("stops the fixer until Joe replies", () => {
    expect(stopReason(fixRound(state(false)), HEAD_SHA)).toContain(
      "already replied",
    );
  });

  it("lets the fixer take it up once Joe replies", () => {
    const round = fixRound(state(true));

    expect(stopReason(round, HEAD_SHA)).toBeNull();
    expect(fixInputText(state(true).pull, "None.", round)).toContain(
      "Fix it here.",
    );
    expect(
      answerProblems(
        {
          status: "done",
          commit: null,
          replies: [
            {
              findingId: "comment-1",
              outcome: "wrong",
              issue: null,
              reply: "Why.",
            },
          ],
        },
        round,
        {
          local: { head: HEAD_SHA, parent: OLD_SHA, clean: true },
          openIssues: new Set(),
          ownIssues: new Set(),
        },
      ),
    ).toEqual([]);
  });
});

describe("markers", () => {
  it("reads back each outcome from the marker code writes", () => {
    const read = OUTCOMES.map((outcome) =>
      outcomeOf(`${markerLine(outcome, "c".repeat(40), 80)}\n\nWhy.`),
    );

    expect(read).toEqual([...OUTCOMES]);
    expect(outcomeOf("I think this is fine.")).toBeNull();
  });
});

describe("stopReason", () => {
  const withFinding = prState({
    comments: [inlineComment(1, finding("F2"), HEAD_SHA)],
  });

  it("goes on when the head is checked out and has a finding marked fix", () => {
    expect(stopReason(fixRound(withFinding), HEAD_SHA)).toBeNull();
  });

  it("stops on another commit", () => {
    expect(stopReason(fixRound(withFinding), OLD_SHA)).toContain(
      "isn't the PR's head",
    );
  });

  it("stops when nothing is marked fix", () => {
    const notesOnly = prState({
      comments: [inlineComment(1, finding("N3"), HEAD_SHA)],
    });

    expect(stopReason(fixRound(notesOnly), HEAD_SHA)).toContain(
      'marked no finding "fix"',
    );
  });

  it("stops when the fixer already replied in this round", () => {
    const replied = prState({
      comments: [
        inlineComment(1, finding("F2"), HEAD_SHA),
        replyComment(2, 1, FIXER_BOT, "**Not fixed:** wrong.\n\nWhy."),
      ],
    });

    expect(stopReason(fixRound(replied), HEAD_SHA)).toContain(
      "already replied",
    );
  });
});

describe("decisionsComment", () => {
  it("is the first conversation comment by the PR's author", () => {
    const state = prState({
      issueComments: [
        conversationComment(1, "A bot's comment."),
        conversationComment(2, "## Decisions", "nimbusscale"),
        conversationComment(3, "More decisions.", "nimbusscale"),
      ],
    });

    expect(decisionsComment(state.pull, state.issueComments)).toBe(
      "## Decisions",
    );
  });
});
