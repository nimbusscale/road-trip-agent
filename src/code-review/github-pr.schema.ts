import { z } from "zod";

// The parts of GitHub's pull request data that the fixer's code reads (code review
// design sections 3.6, 4.4, and 4.5). GitHub's names are snake_case, so each schema
// turns them into camelCase. A deleted account shows as a null user, so its login is
// empty.

const loginSchema = z
  .object({ login: z.string() })
  .nullable()
  .transform((user) => user?.login ?? "");

// gh api --paginate --slurp returns one array per page.
function pagesOf<T extends z.ZodType>(item: T) {
  return z.array(z.array(item)).transform((pages) => pages.flat());
}

export const pullSchema = z
  .object({
    number: z.int(),
    body: z.string().nullable(),
    user: loginSchema,
    head: z.object({ sha: z.string(), ref: z.string() }),
  })
  .transform((pull) => ({
    number: pull.number,
    body: pull.body ?? "",
    author: pull.user,
    headSha: pull.head.sha,
    headRef: pull.head.ref,
  }));

export type Pull = z.infer<typeof pullSchema>;

// An inline comment, or a reply on its thread. A comment on a whole file has no line.
export const reviewCommentSchema = z
  .object({
    id: z.int(),
    user: loginSchema,
    body: z.string(),
    path: z.string(),
    original_line: z.int().nullable(),
    original_commit_id: z.string(),
    in_reply_to_id: z.int().optional(),
    html_url: z.string(),
  })
  .transform((comment) => ({
    id: comment.id,
    author: comment.user,
    body: comment.body,
    path: comment.path,
    line: comment.original_line,
    commitId: comment.original_commit_id,
    inReplyToId: comment.in_reply_to_id ?? null,
    url: comment.html_url,
  }));

export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export const reviewCommentsSchema = pagesOf(reviewCommentSchema);

// A review. Each inline comment comes with one whose body is empty. Only a review
// holding findings on files outside the diff has a body.
export const reviewSchema = z
  .object({
    id: z.int(),
    user: loginSchema,
    body: z.string().nullable(),
    commit_id: z.string().nullable(),
    html_url: z.string(),
  })
  .transform((review) => ({
    id: review.id,
    author: review.user,
    body: review.body ?? "",
    commitId: review.commit_id ?? "",
    url: review.html_url,
  }));

export type Review = z.infer<typeof reviewSchema>;

export const reviewsSchema = pagesOf(reviewSchema);

// A conversation comment.
export const issueCommentSchema = z
  .object({
    id: z.int(),
    user: loginSchema,
    body: z.string().nullable(),
    html_url: z.string(),
  })
  .transform((comment) => ({
    id: comment.id,
    author: comment.user,
    body: comment.body ?? "",
    url: comment.html_url,
  }));

export type IssueComment = z.infer<typeof issueCommentSchema>;

export const issueCommentsSchema = pagesOf(issueCommentSchema);

// An issue, to check that a finding is deferred to an open one. GitHub returns a PR
// from the same endpoint, with a pull_request field.
export const issueSchema = z
  .object({
    number: z.int(),
    state: z.string(),
    pull_request: z.unknown().optional(),
  })
  .transform((issue) => ({
    number: issue.number,
    isOpenIssue: issue.state === "open" && issue.pull_request === undefined,
  }));

// The PR's review threads, from GraphQL, keyed by the ID of each thread's first
// comment, which is the finding.
const threadPageSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          nodes: z.array(
            z.object({
              id: z.string(),
              isResolved: z.boolean(),
              comments: z.object({
                nodes: z.array(z.object({ databaseId: z.int() })),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});

export const reviewThreadsSchema = z
  .array(threadPageSchema)
  .transform((pages) =>
    pages.flatMap((page) =>
      page.data.repository.pullRequest.reviewThreads.nodes.flatMap((thread) =>
        thread.comments.nodes.slice(0, 1).map((first) => ({
          threadId: thread.id,
          isResolved: thread.isResolved,
          firstCommentId: first.databaseId,
        })),
      ),
    ),
  );

export type ReviewThread = z.infer<typeof reviewThreadsSchema>[number];

// The comment GitHub returns after a post.
export const postedCommentSchema = z
  .object({ id: z.int(), html_url: z.string() })
  .transform((comment) => ({ id: comment.id, url: comment.html_url }));
