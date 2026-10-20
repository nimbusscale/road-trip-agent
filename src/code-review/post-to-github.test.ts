import { describe, expect, it } from "vitest";

import {
  type GitHubPost,
  postFindings,
  type ReviewTarget,
} from "./post-to-github.js";
import type { Finding } from "./review-result.schema.js";

const TARGET: ReviewTarget = {
  repository: "owner/repo",
  pullNumber: 7,
  commitId: "a".repeat(40),
};

function finding(file: string, label: Finding["label"] = "F2"): Finding {
  return { file, line: 12, label, finding: "It breaks.", labelReason: "Why." };
}

interface Sent {
  path: string;
  body: Readonly<Record<string, unknown>>;
}

// A fake GitHub that refuses a line comment on any file in `lineOutside`, and a file
// comment on any file in `fileOutside`, as GitHub does for places outside the diff.
function fakeGitHub(lineOutside: string[], fileOutside: string[]) {
  const sent: Sent[] = [];
  const post: GitHubPost = (path, body) => {
    sent.push({ path, body });
    const file = body.path;
    const refused =
      typeof file === "string" &&
      (body.subject_type === "file" ? fileOutside : lineOutside).includes(file);
    return Promise.resolve(
      refused
        ? { posted: false, reason: "outside the diff" }
        : { posted: true },
    );
  };
  return { sent, post };
}

describe("postFindings", () => {
  it("posts each finding on its line, and doesn't post the D labels", async () => {
    const github = fakeGitHub([], []);
    const counts = await postFindings(
      [finding("src/a.ts"), finding("src/b.ts", "D1")],
      TARGET,
      github.post,
    );
    expect(counts).toEqual({ inline: 1, fileLevel: 0, outsideDiff: 0 });
    expect(github.sent.map((sent) => sent.path)).toEqual([
      "/repos/owner/repo/pulls/7/comments",
    ]);
    // Entries, since GitHub's snake_case names can't be object keys here.
    expect(Object.entries(github.sent[0]?.body ?? {})).toEqual([
      ["commit_id", TARGET.commitId],
      ["path", "src/a.ts"],
      ["line", 12],
      ["side", "RIGHT"],
      ["body", "**Fix (F2)**\n\nIt breaks.\n\n**Why F2:** Why."],
    ]);
  });

  it("posts on the file when the line isn't in the diff", async () => {
    const github = fakeGitHub(["src/a.ts"], []);
    const counts = await postFindings(
      [finding("src/a.ts")],
      TARGET,
      github.post,
    );
    expect(counts).toEqual({ inline: 0, fileLevel: 1, outsideDiff: 0 });
    expect(Object.entries(github.sent[1]?.body ?? {})).toEqual([
      ["commit_id", TARGET.commitId],
      ["path", "src/a.ts"],
      ["subject_type", "file"],
      ["body", "Line 12.\n\n**Fix (F2)**\n\nIt breaks.\n\n**Why F2:** Why."],
    ]);
  });

  it("puts findings on files outside the diff into one review body", async () => {
    const outside = ["design/x.md", "design/y.md"];
    const github = fakeGitHub(outside, outside);
    const counts = await postFindings(
      [finding("design/x.md"), finding("design/y.md", "N6")],
      TARGET,
      github.post,
    );
    expect(counts).toEqual({ inline: 0, fileLevel: 0, outsideDiff: 2 });
    const review = github.sent.at(-1);
    expect(review?.path).toBe("/repos/owner/repo/pulls/7/reviews");
    expect(review?.body.event).toBe("COMMENT");
    expect(review?.body.body).toContain("### `design/x.md:12`");
    expect(review?.body.body).toContain("### `design/y.md:12`");
  });

  it("posts nothing when there are no findings", async () => {
    const github = fakeGitHub([], []);
    await postFindings([], TARGET, github.post);
    expect(github.sent).toEqual([]);
  });
});
