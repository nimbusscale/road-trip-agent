import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PrState } from "./fix-round.js";
import {
  issueCommentsSchema,
  issueSchema,
  pullSchema,
  reviewCommentsSchema,
  reviewsSchema,
  reviewThreadsSchema,
  type ReviewThread,
} from "./github-pr.schema.js";

const execFileAsync = promisify(execFile);

// Runs gh api with these arguments, and returns its JSON. gh fills {owner} and {repo}
// from the repo the command runs in, and signs in with GH_TOKEN when it's set, such
// as the fixer app's token, or else with Joe's login.
export type GhApi = (args: readonly string[]) => Promise<unknown>;

export const ghApi: GhApi = async (args) => {
  const { stdout } = await execFileAsync("gh", ["api", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stdout.trim() === "") {
    return null;
  }
  const parsed: unknown = JSON.parse(stdout);
  return parsed;
};

export async function git(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args);
  return stdout.trim();
}

export async function loadPrState(
  gh: GhApi,
  pullNumber: number,
): Promise<PrState> {
  const pullPath = `repos/{owner}/{repo}/pulls/${String(pullNumber)}`;
  const issuePath = `repos/{owner}/{repo}/issues/${String(pullNumber)}`;
  const list = (path: string) =>
    gh(["--paginate", "--slurp", `${path}?per_page=100`]);
  const [pull, comments, reviews, issueComments] = await Promise.all([
    gh([pullPath]),
    list(`${pullPath}/comments`),
    list(`${pullPath}/reviews`),
    list(`${issuePath}/comments`),
  ]);
  return {
    pull: pullSchema.parse(pull),
    comments: reviewCommentsSchema.parse(comments),
    reviews: reviewsSchema.parse(reviews),
    issueComments: issueCommentsSchema.parse(issueComments),
  };
}

const THREADS_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
      }
    }
  }
}`;

export async function loadThreads(
  gh: GhApi,
  pullNumber: number,
): Promise<ReviewThread[]> {
  return reviewThreadsSchema.parse(
    await gh([
      "graphql",
      "--paginate",
      "--slurp",
      "-f",
      `query=${THREADS_QUERY}`,
      "-F",
      "owner={owner}",
      "-F",
      "repo={repo}",
      "-F",
      `number=${String(pullNumber)}`,
    ]),
  );
}

// Whether each number is an open issue, not a PR or a closed issue. A number GitHub
// doesn't know counts as not open.
export async function openIssues(
  gh: GhApi,
  numbers: readonly number[],
): Promise<Set<number>> {
  const open = new Set<number>();
  for (const number of new Set(numbers)) {
    try {
      const issue = issueSchema.parse(
        await gh([`repos/{owner}/{repo}/issues/${String(number)}`]),
      );
      if (issue.isOpenIssue) {
        open.add(number);
      }
    } catch (error) {
      console.error(`Couldn't read issue #${String(number)}: ${String(error)}`);
    }
  }
  return open;
}

// The checked-out commit, its parent, and whether anything is left uncommitted.
export interface LocalCommits {
  readonly head: string;
  readonly parent: string;
  readonly clean: boolean;
}

export async function localCommits(): Promise<LocalCommits> {
  const [head, parent, status] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "HEAD^"]),
    git(["status", "--porcelain"]),
  ]);
  return { head, parent, clean: status === "" };
}
