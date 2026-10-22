import { commentBody, fileCommentBody, outsideDiffBody } from "./findings.js";
import { FIXER_BOT, type PrState, REVIEWER_BOT } from "./fix-round.js";
import type {
  IssueComment,
  Review,
  ReviewComment,
} from "./github-pr.schema.js";
import type { Finding, Label } from "./review-result.schema.js";

// A PR as GitHub returns it, built with the same functions that post the findings, so
// the tests read what the reviewer's code writes.

export const OLD_SHA = "a".repeat(40);
export const HEAD_SHA = "b".repeat(40);
export const FIX_SHA = "c".repeat(40);
export const PR_URL = "https://github.com/nimbusscale/road-trip-agent/pull/7";

export function finding(label: Label, file = "src/a.ts", line = 10): Finding {
  return {
    file,
    line,
    label,
    finding: `The ${label} problem in ${file}. More detail.`,
    labelReason: `Reason for ${label}.`,
  };
}

export function inlineComment(
  id: number,
  posted: Finding,
  commitId: string,
): ReviewComment {
  return {
    id,
    author: REVIEWER_BOT,
    body: commentBody(posted),
    path: posted.file,
    line: posted.line,
    commitId,
    inReplyToId: null,
    url: `${PR_URL}#discussion_r${String(id)}`,
  };
}

export function fileComment(
  id: number,
  posted: Finding,
  commitId: string,
): ReviewComment {
  return {
    ...inlineComment(id, posted, commitId),
    body: fileCommentBody(posted),
    line: null,
  };
}

export function replyComment(
  id: number,
  inReplyToId: number,
  author: string,
  body: string,
): ReviewComment {
  return {
    id,
    author,
    body,
    path: "src/a.ts",
    line: 10,
    commitId: OLD_SHA,
    inReplyToId,
    url: `${PR_URL}#discussion_r${String(id)}`,
  };
}

export function outsideDiffReview(
  id: number,
  posted: readonly Finding[],
  commitId: string,
): Review {
  return {
    id,
    author: REVIEWER_BOT,
    body: outsideDiffBody(posted),
    commitId,
    url: `${PR_URL}#pullrequestreview-${String(id)}`,
  };
}

export function conversationComment(
  id: number,
  body: string,
  author = FIXER_BOT,
): IssueComment {
  return { id, author, body, url: `${PR_URL}#issuecomment-${String(id)}` };
}

export function prState(parts: Partial<PrState>): PrState {
  return {
    pull: {
      number: 7,
      body: "Closes #76\n\nThe task.",
      author: "nimbusscale",
      headSha: HEAD_SHA,
      headRef: "some-branch",
    },
    comments: [],
    reviews: [],
    issueComments: [],
    ...parts,
  };
}
