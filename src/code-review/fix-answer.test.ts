import { describe, expect, it } from "vitest";

import {
  type AnswerFacts,
  answerProblems,
  closedIssues,
} from "./fix-answer.js";
import type { FixAnswer, FixReply } from "./fix-answer.schema.js";
import { fixRound } from "./fix-round.js";
import {
  FIX_SHA,
  finding,
  HEAD_SHA,
  inlineComment,
  prState,
} from "./fix-test-state.js";

const round = fixRound(
  prState({
    comments: [
      inlineComment(1, finding("F2"), HEAD_SHA),
      inlineComment(2, finding("F3", "src/b.ts"), HEAD_SHA),
    ],
  }),
);

const committed: AnswerFacts = {
  local: { head: FIX_SHA, parent: HEAD_SHA, clean: true },
  openIssues: new Set([80]),
  ownIssues: new Set([76]),
};

function reply(
  findingId: string,
  outcome: FixReply["outcome"],
  issue: number | null = null,
): FixReply {
  return { findingId, outcome, issue, reply: "Why." };
}

function done(commit: string | null, replies: FixReply[]): FixAnswer {
  return { status: "done", commit, replies };
}

describe("answerProblems", () => {
  it("passes an answer with one entry per finding and its commit", () => {
    const answer = done(FIX_SHA, [
      reply("comment-1", "fixed"),
      reply("comment-2", "deferred", 80),
    ]);

    expect(answerProblems(answer, round, committed)).toEqual([]);
  });

  it("finds a missing entry, a doubled one, and a made-up ID", () => {
    const answer = done(FIX_SHA, [
      reply("comment-1", "fixed"),
      reply("comment-1", "fixed"),
      reply("comment-99", "wrong"),
    ]);

    expect(answerProblems(answer, round, committed)).toEqual([
      "comment-1 has more than one entry.",
      "comment-99 isn't a finding marked \"fix\" in this round, or one that needs attention with a reply after the fixer's.",
      "comment-2 has no entry.",
    ]);
  });

  it("refuses a deferral to the PR's own issue, a closed one, or none", () => {
    const answer = done(null, [
      reply("comment-1", "deferred", 76),
      reply("comment-2", "deferred", 81),
    ]);
    const unchanged = {
      ...committed,
      local: { ...committed.local, head: HEAD_SHA },
    };

    expect(answerProblems(answer, round, unchanged)).toEqual([
      "comment-1 is deferred to #76, the PR's own issue.",
      "comment-2 is deferred to #81, which isn't an open issue.",
    ]);
    expect(
      answerProblems(
        done(null, [
          reply("comment-1", "deferred"),
          reply("comment-2", "wrong", 80),
        ]),
        round,
        unchanged,
      ),
    ).toEqual([
      "comment-1 is deferred, but gives no issue.",
      'comment-2 gives an issue, but only "deferred" takes one.',
    ]);
  });

  it("needs a commit for a fix, on top of the PR's head, with nothing left over", () => {
    const fixedNoCommit = done(null, [
      reply("comment-1", "fixed"),
      reply("comment-2", "wrong"),
    ]);
    const twoCommits = {
      ...committed,
      local: { head: FIX_SHA, parent: "d".repeat(40), clean: false },
    };

    expect(answerProblems(fixedNoCommit, round, twoCommits)).toEqual([
      "Some changes aren't committed. Commit them, or undo them.",
      'A finding is "fixed", but the answer gives no commit.',
      `The answer gives no commit, but the checked-out commit ${FIX_SHA} isn't the PR's head, ${HEAD_SHA}.`,
    ]);
    expect(
      answerProblems(
        done(FIX_SHA, [
          reply("comment-1", "wrong"),
          reply("comment-2", "wrong"),
        ]),
        round,
        twoCommits,
      ),
    ).toContain('The answer gives a commit, but no finding is "fixed".');
  });

  it("checks nothing when the fixer stopped", () => {
    expect(
      answerProblems({ status: "stopped", reason: "Why." }, round, committed),
    ).toEqual([]);
  });
});

describe("closedIssues", () => {
  it("reads each issue the description closes", () => {
    expect(
      closedIssues("Closes #76\nFixes #3, and resolves #12. See #9."),
    ).toEqual(new Set([76, 3, 12]));
  });
});
