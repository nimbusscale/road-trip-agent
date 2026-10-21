import { z } from "zod";

// The bodies the posting step sends to GitHub's pull request API. GitHub's names are
// snake_case, so each schema turns the camelCase input into them.

// An inline comment on one line of the PR's version of a file.
export const lineCommentSchema = z
  .object({
    commitId: z.string(),
    path: z.string(),
    line: z.int(),
    body: z.string(),
  })
  .transform((comment) => ({
    commit_id: comment.commitId,
    path: comment.path,
    line: comment.line,
    side: "RIGHT",
    body: comment.body,
  }));

// A comment on a whole file, for a line outside the diff.
export const fileCommentSchema = z
  .object({ commitId: z.string(), path: z.string(), body: z.string() })
  .transform((comment) => ({
    commit_id: comment.commitId,
    path: comment.path,
    subject_type: "file",
    body: comment.body,
  }));

// A review with only a body, for files outside the diff.
export const reviewBodySchema = z
  .object({ commitId: z.string(), body: z.string() })
  .transform((review) => ({
    commit_id: review.commitId,
    event: "COMMENT",
    body: review.body,
  }));
