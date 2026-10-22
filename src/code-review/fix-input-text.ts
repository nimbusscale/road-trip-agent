import {
  FIXER_BOT,
  type FixRound,
  type PostedFinding,
  whereOf,
} from "./fix-round.js";
import type { IssueComment, Pull } from "./github-pr.schema.js";

// Why the fixer stops before it starts, or null when it can go on (the fix-pr skill's
// step 2).
export function stopReason(round: FixRound, localHead: string): string | null {
  if (localHead !== round.headSha) {
    return `The checked-out commit, ${localHead}, isn't the PR's head, ${round.headSha}.`;
  }
  if (round.current.length === 0 && round.askable.length === 0) {
    return `The review of ${round.headSha} marked no finding "fix", and no earlier finding that needs attention has a new reply.`;
  }
  const replied = round.current.filter((f) =>
    f.replies.some((r) => r.author === FIXER_BOT),
  );
  if (replied.length > 0) {
    return `The fixer already replied on this round's ${replied.map((f) => f.id).join(", ")}.`;
  }
  return null;
}

// The decisions comment is the first conversation comment by the PR's author (code
// review design section 4.5).
export function decisionsComment(
  pull: Pull,
  issueComments: readonly IssueComment[],
): string {
  return issueComments.find((c) => c.author === pull.author)?.body ?? "None.";
}

// What the fixer reads: the PR description, the decisions comment, this round's
// findings marked "fix", and the earlier ones with their replies.
export function fixInputText(
  pull: Pull,
  decisions: string,
  round: FixRound,
): string {
  const askable = new Set(round.askable.map((f) => f.id));
  return [
    `# PR #${String(pull.number)}`,
    "## The PR description",
    pull.body.trim() === "" ? "None." : pull.body.trim(),
    "## The decisions comment",
    decisions.trim(),
    `## Findings marked "fix" in the last review, of ${round.headSha.slice(0, 7)}`,
    sectionOrNone(round.current.map((f) => findingText(f))),
    "## Earlier findings and their replies",
    sectionOrNone(
      round.earlier.map((f) =>
        [findingText(f), repliesText(f, askable.has(f.id))].join("\n\n"),
      ),
    ),
  ].join("\n\n");
}

function sectionOrNone(parts: readonly string[]): string {
  return parts.length === 0 ? "None." : parts.join("\n\n");
}

function findingText(finding: PostedFinding): string {
  const where = whereOf(finding);
  return [
    `### ${finding.id}: \`${where}\`, ${finding.label}, reviewed at ${finding.commitId.slice(0, 7)}`,
    finding.text,
    `**Why ${finding.label}:** ${finding.labelReason}`,
  ].join("\n\n");
}

function repliesText(finding: PostedFinding, askable: boolean): string {
  const replies = finding.replies.map(
    (r) => `- **${r.author}:**\n\n${indent(r.body)}`,
  );
  const lines = [
    "Replies:",
    replies.length === 0 ? "None." : replies.join("\n\n"),
  ];
  if (askable) {
    lines.push(
      `Someone replied after this finding was marked "needs attention". If the reply says to fix it, handle it like a finding marked "fix", and give it an entry with the ID ${finding.id}.`,
    );
  }
  return lines.join("\n\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? "" : `  ${line}`))
    .join("\n");
}
