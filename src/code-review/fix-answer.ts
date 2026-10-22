import type { FixAnswer, FixReply } from "./fix-answer.schema.js";
import type { FixRound } from "./fix-round.js";
import type { LocalCommits } from "./fix-state.js";

// What the check needs besides the answer and the round, read from git and GitHub.
export interface AnswerFacts {
  readonly local: LocalCommits;
  readonly openIssues: ReadonlySet<number>;
  // The issues the PR closes. A finding can't be deferred to the PR's own issue.
  readonly ownIssues: ReadonlySet<number>;
}

// What's wrong with the fixer's answer for this round, or nothing (code review design
// section 4.5). Nothing is posted until the list is empty.
export function answerProblems(
  answer: FixAnswer,
  round: FixRound,
  facts: AnswerFacts,
): string[] {
  if (answer.status === "stopped") {
    return [];
  }
  return [
    ...coverageProblems(answer.replies, round),
    ...answer.replies.flatMap((reply) => issueProblems(reply, facts)),
    ...commitProblems(answer, round.headSha, facts.local),
  ];
}

// Each finding marked "fix" in this round, and not yet replied on, gets exactly one
// entry. Another may get one only when it needs attention and someone replied after
// the fixer.
function coverageProblems(
  replies: readonly FixReply[],
  round: FixRound,
): string[] {
  const allowed = new Set(
    [...round.pending, ...round.askable].map((f) => f.id),
  );
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const { findingId } of replies) {
    if (seen.has(findingId)) {
      problems.push(`${findingId} has more than one entry.`);
    }
    seen.add(findingId);
    if (!allowed.has(findingId)) {
      problems.push(
        `${findingId} isn't a finding marked "fix" in this round, or one that needs attention with a reply after the fixer's.`,
      );
    }
  }
  for (const finding of round.pending) {
    if (!seen.has(finding.id)) {
      problems.push(`${finding.id} has no entry.`);
    }
  }
  return problems;
}

function issueProblems(reply: FixReply, facts: AnswerFacts): string[] {
  const { findingId, outcome, issue } = reply;
  if (outcome !== "deferred") {
    return issue === null
      ? []
      : [`${findingId} gives an issue, but only "deferred" takes one.`];
  }
  if (issue === null) {
    return [`${findingId} is deferred, but gives no issue.`];
  }
  if (facts.ownIssues.has(issue)) {
    return [
      `${findingId} is deferred to #${String(issue)}, the PR's own issue.`,
    ];
  }
  return facts.openIssues.has(issue)
    ? []
    : [
        `${findingId} is deferred to #${String(issue)}, which isn't an open issue.`,
      ];
}

// A commit comes with a finding fixed, and the other way around. It's one commit on
// top of the PR's head, checked out, with nothing left uncommitted.
function commitProblems(
  answer: Extract<FixAnswer, { status: "done" }>,
  headSha: string,
  local: LocalCommits,
): string[] {
  const anyFixed = answer.replies.some((r) => r.outcome === "fixed");
  const problems: string[] = [];
  if (!local.clean) {
    problems.push("Some changes aren't committed. Commit them, or undo them.");
  }
  if (answer.commit === null) {
    if (anyFixed) {
      problems.push('A finding is "fixed", but the answer gives no commit.');
    }
    if (local.head !== headSha) {
      problems.push(
        `The answer gives no commit, but the checked-out commit ${local.head} isn't the PR's head, ${headSha}.`,
      );
    }
    return problems;
  }
  if (!anyFixed) {
    problems.push('The answer gives a commit, but no finding is "fixed".');
  }
  if (answer.commit !== local.head) {
    problems.push(
      `The commit ${answer.commit} isn't the checked-out commit, ${local.head}.`,
    );
  }
  if (local.parent !== headSha) {
    problems.push(
      `The commit's parent should be the PR's head, ${headSha}. Make one commit on top of it.`,
    );
  }
  return problems;
}

// The issues the PR's description closes, such as "Closes #76".
export function closedIssues(description: string): Set<number> {
  const matches = description.matchAll(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
  );
  return new Set([...matches].map((match) => Number(match[1])));
}
