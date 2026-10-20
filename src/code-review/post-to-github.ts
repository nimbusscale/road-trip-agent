import {
  commentBody,
  fileCommentBody,
  outsideDiffBody,
  postedFindings,
} from "./findings.js";
import {
  fileCommentSchema,
  lineCommentSchema,
  reviewBodySchema,
} from "./github-comment.schema.js";
import type { Finding } from "./review-result.schema.js";

// Which PR the findings go on, at the commit that was reviewed.
export interface ReviewTarget {
  readonly repository: string;
  readonly pullNumber: number;
  readonly commitId: string;
}

// GitHub refuses a comment on a line or file outside the PR's diff with status 422.
// That refusal is passed back, so the caller can post the finding somewhere else. Any
// other failure throws.
export type PostOutcome = { posted: true } | { posted: false; reason: string };

export type GitHubPost = (
  path: string,
  body: Readonly<Record<string, unknown>>,
) => Promise<PostOutcome>;

export function gitHubPost(token: string): GitHubPost {
  return async (path, body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      return { posted: true };
    }
    const reason = await response.text();
    if (response.status === 422) {
      return { posted: false, reason };
    }
    throw new Error(
      `GitHub refused POST ${path} with status ${String(response.status)}: ${reason}`,
    );
  };
}

// Where each posted finding ended up.
export interface PostCounts {
  inline: number;
  fileLevel: number;
  outsideDiff: number;
}

// Posts each finding as an inline comment on its line. When the line isn't in the
// diff, it goes on the file instead, and when the file isn't in the diff either, into
// one review body at the end. The next review reads all three (the review-pr skill,
// step 2).
export async function postFindings(
  findings: readonly Finding[],
  target: ReviewTarget,
  post: GitHubPost,
): Promise<PostCounts> {
  const pullPath = `/repos/${target.repository}/pulls/${String(target.pullNumber)}`;
  const counts: PostCounts = { inline: 0, fileLevel: 0, outsideDiff: 0 };
  const outsideDiff: Finding[] = [];
  for (const finding of postedFindings(findings)) {
    const where = await postComment(finding, target, pullPath, post);
    if (where === "outsideDiff") {
      outsideDiff.push(finding);
    }
    counts[where] += 1;
  }
  if (outsideDiff.length > 0) {
    const outcome = await post(
      `${pullPath}/reviews`,
      reviewBodySchema.parse({
        commitId: target.commitId,
        body: outsideDiffBody(outsideDiff),
      }),
    );
    if (!outcome.posted) {
      throw new Error(`GitHub refused the review body: ${outcome.reason}`);
    }
  }
  return counts;
}

async function postComment(
  finding: Finding,
  target: ReviewTarget,
  pullPath: string,
  post: GitHubPost,
): Promise<keyof PostCounts> {
  const where = `${finding.file}:${String(finding.line)}`;
  const onLine = await post(
    `${pullPath}/comments`,
    lineCommentSchema.parse({
      commitId: target.commitId,
      path: finding.file,
      line: finding.line,
      body: commentBody(finding),
    }),
  );
  if (onLine.posted) {
    return "inline";
  }
  console.error(`Not on ${where}, so posting on the file: ${onLine.reason}`);
  const onFile = await post(
    `${pullPath}/comments`,
    fileCommentSchema.parse({
      commitId: target.commitId,
      path: finding.file,
      body: fileCommentBody(finding),
    }),
  );
  if (onFile.posted) {
    return "fileLevel";
  }
  console.error(
    `Not on ${finding.file}, so adding to the review body: ${onFile.reason}`,
  );
  return "outsideDiff";
}
