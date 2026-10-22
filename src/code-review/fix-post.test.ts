import { describe, expect, it } from "vitest";

import { postFix } from "./fix-post.js";
import { fixRound } from "./fix-round.js";
import type { GhApi } from "./fix-state.js";
import {
  FIX_SHA,
  finding,
  HEAD_SHA,
  inlineComment,
  outsideDiffReview,
  prState,
} from "./fix-test-state.js";

const state = prState({
  comments: [
    inlineComment(1, finding("F2"), HEAD_SHA),
    inlineComment(2, finding("F3", "src/b.ts"), HEAD_SHA),
  ],
  reviews: [outsideDiffReview(9, [finding("F6", "design/x.md", 47)], HEAD_SHA)],
});

// GitHub's reply to a post. As JSON text, since GitHub's names are snake_case.
const POSTED: unknown = JSON.parse(
  '{"id":100,"html_url":"https://example/posted"}',
);

// Answers like GitHub, for the PR above, and keeps each call's arguments.
function fakeGh(calls: string[][]): GhApi {
  return (args) => {
    calls.push([...args]);
    const joined = args.join(" ");
    if (joined.includes("reviewThreads")) {
      const nodes = [1, 2].map((id) => ({
        id: `T${String(id)}`,
        isResolved: false,
        comments: { nodes: [{ databaseId: id }] },
      }));
      return Promise.resolve([
        { data: { repository: { pullRequest: { reviewThreads: { nodes } } } } },
      ]);
    }
    if (args.includes("POST") || args.includes("PATCH")) {
      return Promise.resolve(POSTED);
    }
    if (joined.includes("--slurp")) {
      return Promise.resolve([[]]);
    }
    if (args[0]?.endsWith("/pulls/7") === true) {
      return Promise.resolve({
        number: 7,
        body: "Closes #76",
        user: { login: "nimbusscale" },
        head: { sha: HEAD_SHA, ref: "some-branch" },
      });
    }
    return Promise.resolve(null);
  };
}

describe("postFix", () => {
  it("replies on each thread, resolves only the fixed and not-fixed ones, and pushes last", async () => {
    const calls: string[][] = [];
    const pushed: string[] = [];
    const log = await postFix(
      fakeGh(calls),
      7,
      {
        answer: {
          status: "done",
          reason: "The round.",
          replies: [
            {
              findingId: "comment-1",
              outcome: "fixed",
              deferredTo: null,
              reply: "Fixed it.",
            },
            {
              findingId: "comment-2",
              outcome: "deferred",
              deferredTo: 80,
              reply: "It fits #80.",
            },
            {
              findingId: "review-9-1",
              outcome: "wrong",
              deferredTo: null,
              reply: "The doc is right.",
            },
          ],
        },
        round: fixRound(state),
        headRef: "some-branch",
        commit: FIX_SHA,
      },
      (headRef) => {
        // The push starts the next review, so every write is done by then.
        pushed.push(`${headRef} after ${String(calls.length)} calls`);
        return Promise.resolve();
      },
    );

    expect(pushed).toEqual([`some-branch after ${String(calls.length)} calls`]);
    const posts = calls.filter((c) => c.includes("POST"));
    expect(posts.map((c) => c[2])).toEqual([
      "repos/{owner}/{repo}/pulls/7/comments/1/replies",
      "repos/{owner}/{repo}/pulls/7/comments/2/replies",
      "repos/{owner}/{repo}/issues/7/comments",
      "repos/{owner}/{repo}/issues/7/comments",
    ]);
    expect(posts[0]?.[4]).toBe(`body=**Fixed** in ${FIX_SHA}.\n\nFixed it.`);
    expect(posts[1]?.[4]).toBe("body=**Deferred:** #80.\n\nIt fits #80.");
    expect(posts[2]?.[4]).toContain(
      "body=**Not fixed:** wrong.\n\n> On `design/x.md:47`",
    );
    expect(posts[2]?.[4]).toContain("<!-- fix-loop: review-9-1 -->");
    const resolved = calls.filter((c) =>
      c.join(" ").includes("resolveReviewThread"),
    );
    expect(resolved.map((c) => c.at(-1))).toEqual(["id=T1"]);
    expect(log.slice(-2)).toEqual([
      "Posted the summary: https://example/posted",
      `Pushed ${FIX_SHA} to some-branch.`,
    ]);
  });
});
