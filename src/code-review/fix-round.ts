import type { Outcome } from "./fix-answer.schema.js";
import { outcomeOf, taggedFindingId } from "./fix-markers.js";
import type {
  IssueComment,
  Pull,
  Review,
  ReviewComment,
} from "./github-pr.schema.js";

// Each agent posts as its own GitHub App, so code tells their comments apart by author
// (code review design section 4.6).
export const REVIEWER_BOT = "nimbusscale-review-pr[bot]";
export const FIXER_BOT = "nimbusscale-fix-pr[bot]";

export interface Reply {
  readonly author: string;
  readonly body: string;
  readonly url: string;
}

// A finding as the reviewer posted it, with the replies on it. The ID is the inline
// comment's, or for a finding in a review body, the review's and its place there.
export interface PostedFinding {
  readonly id: string;
  readonly commitId: string;
  readonly file: string;
  readonly line: number | null;
  readonly kind: string;
  readonly label: string;
  readonly text: string;
  readonly labelReason: string;
  readonly url: string;
  // The inline comment that starts the finding's thread, or null in a review body.
  readonly threadCommentId: number | null;
  readonly replies: readonly Reply[];
}

export interface PrState {
  readonly pull: Pull;
  readonly comments: readonly ReviewComment[];
  readonly reviews: readonly Review[];
  readonly issueComments: readonly IssueComment[];
}

// What a round of the fix loop works on (code review design section 4.5): the
// findings marked "fix" in the review of the PR's head that the fixer hasn't replied
// on yet, and the rest, from earlier reviews or already replied on.
export interface FixRound {
  readonly headSha: string;
  readonly pending: readonly PostedFinding[];
  readonly earlier: readonly PostedFinding[];
  // Findings that need attention, where someone other than the bots replied after the
  // fixer. The fixer may handle them, if the reply says to fix them. One can be from
  // the review of the head, when the fixer pushed nothing after it.
  readonly askable: readonly PostedFinding[];
}

const FINDING_PATTERN =
  /^\*\*(Fix|Check|Note) \(([A-Z0-9]+)\)\*\*\n\n([\s\S]+?)\n\n\*\*Why \2:\*\* ([\s\S]+)$/;

interface ParsedBody {
  kind: string;
  label: string;
  text: string;
  labelReason: string;
}

// The parts of a finding's text, as findings.ts's commentBody() writes them.
export function parseFindingBody(body: string): ParsedBody | null {
  const match = FINDING_PATTERN.exec(body.trim());
  if (match === null) {
    return null;
  }
  const [, kind = "", label = "", text = "", labelReason = ""] = match;
  return { kind, label, text, labelReason };
}

export function postedFindings(state: PrState): PostedFinding[] {
  const fromComments = state.comments
    .filter((c) => c.author === REVIEWER_BOT && c.inReplyToId === null)
    .flatMap((c) => findingFromComment(c, state.comments));
  const fromReviews = state.reviews
    .filter((r) => r.author === REVIEWER_BOT && r.body !== "")
    .flatMap((r) => findingsFromReview(r, state.issueComments));
  return [...fromComments, ...fromReviews];
}

export function fixRound(state: PrState): FixRound {
  const fixes = postedFindings(state).filter((f) => f.kind === "Fix");
  const headSha = state.pull.headSha;
  const isPending = (f: PostedFinding) =>
    f.commitId === headSha && lastFixerReply(f) === null;
  const earlier = fixes.filter((f) => !isPending(f));
  return {
    headSha,
    pending: fixes.filter(isPending),
    earlier,
    askable: earlier.filter(isAskable),
  };
}

// Where the finding points, as `file:line`, or just the file.
export function whereOf(finding: PostedFinding): string {
  return finding.line === null
    ? finding.file
    : `${finding.file}:${String(finding.line)}`;
}

// The outcome of the fixer's last reply on the finding, or null when it has none.
export function lastOutcome(finding: PostedFinding): Outcome | null {
  const reply = lastFixerReply(finding);
  return reply === null ? null : outcomeOf(reply.body);
}

export function lastFixerReply(finding: PostedFinding): Reply | null {
  return (
    finding.replies.findLast(
      (r) => r.author === FIXER_BOT && outcomeOf(r.body) !== null,
    ) ?? null
  );
}

function isAskable(finding: PostedFinding): boolean {
  const fixerReply = lastFixerReply(finding);
  if (fixerReply === null || outcomeOf(fixerReply.body) !== "needs_attention") {
    return false;
  }
  const after = finding.replies.slice(finding.replies.indexOf(fixerReply) + 1);
  return after.some((r) => r.author !== FIXER_BOT && r.author !== REVIEWER_BOT);
}

// An inline comment, or one on a whole file, which names its line in its first line.
function findingFromComment(
  comment: ReviewComment,
  all: readonly ReviewComment[],
): PostedFinding[] {
  const fileLevel = /^Line (\d+)\.\n\n/.exec(comment.body);
  const parsed = parseFindingBody(
    fileLevel === null ? comment.body : comment.body.slice(fileLevel[0].length),
  );
  if (parsed === null) {
    return [];
  }
  const replies = all
    .filter((c) => c.inReplyToId === comment.id)
    .sort((a, b) => a.id - b.id)
    .map((c) => ({ author: c.author, body: c.body, url: c.url }));
  return [
    {
      ...parsed,
      id: `comment-${String(comment.id)}`,
      commitId: comment.commitId,
      file: comment.path,
      line: fileLevel?.[1] === undefined ? comment.line : Number(fileLevel[1]),
      url: comment.url,
      threadCommentId: comment.id,
      replies,
    },
  ];
}

// A review body holds one section per finding, each headed by its file and line, as
// findings.ts's outsideDiffBody() writes them. It has no thread, so its replies are
// conversation comments: the fixer's, tagged with the finding's ID, and Joe's, which
// name the ID.
function findingsFromReview(
  review: Review,
  issueComments: readonly IssueComment[],
): PostedFinding[] {
  const sections = review.body.split(/^### `([^`\n]+):(\d+)`$/m).slice(1);
  const findings: PostedFinding[] = [];
  for (let i = 0; i + 2 < sections.length; i += 3) {
    const [file = "", line = "", body = ""] = sections.slice(i, i + 3);
    const parsed = parseFindingBody(body);
    if (parsed === null) {
      continue;
    }
    const id = `review-${String(review.id)}-${String(i / 3 + 1)}`;
    findings.push({
      ...parsed,
      id,
      commitId: review.commitId,
      file,
      line: Number(line),
      url: review.url,
      threadCommentId: null,
      replies: issueComments
        .filter((c) => isReplyTo(c, id))
        .map((c) => ({ author: c.author, body: c.body, url: c.url })),
    });
  }
  return findings;
}

function isReplyTo(comment: IssueComment, findingId: string): boolean {
  if (comment.author === FIXER_BOT || comment.author === REVIEWER_BOT) {
    return taggedFindingId(comment.body) === findingId;
  }
  // The ID ends in a number, so review-9-1 mustn't match in review-9-10.
  return new RegExp(`\\b${findingId}\\b`).test(comment.body);
}
