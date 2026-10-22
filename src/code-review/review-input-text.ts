import { deferredIssueOf, outcomeOf } from "./fix-markers.js";
import { type PostedFinding, type Reply, whereOf } from "./fix-round.js";

// What the reviewer reads about its earlier findings (code review design section 4.3):
// each finding's text and place, and only what the last reply's marker means for the
// review. Never the reply itself, since it holds the fixer's or Joe's reasons, and
// those would color the review.
export function reviewInputText(
  pullNumber: number,
  findings: readonly PostedFinding[],
): string {
  return [
    `# Earlier findings on PR #${String(pullNumber)}`,
    findings.length === 0
      ? "None. No earlier review posted a finding on this PR."
      : findings.map(findingText).join("\n\n"),
  ].join("\n\n");
}

function findingText(finding: PostedFinding): string {
  return [
    `## ${finding.id}: \`${whereOf(finding)}\`, ${finding.kind} (${finding.label}), posted on ${finding.commitId.slice(0, 7)}`,
    finding.text,
    `**Why ${finding.label}:** ${finding.labelReason}`,
    `**What to do with it:** ${whatToDo(lastMarkedReply(finding))}`,
  ].join("\n\n");
}

// The replies hold only the fixer's and Joe's (fix-round.ts), so a marker from anyone
// else never gets here.
function lastMarkedReply(finding: PostedFinding): Reply | null {
  return finding.replies.findLast((r) => outcomeOf(r.body) !== null) ?? null;
}

function whatToDo(reply: Reply | null): string {
  if (reply === null) {
    return "No reply yet. Don't post it again, unless the lines it points to have changed and the problem is still there. Then post it again, and say the change didn't fix it.";
  }
  const marker = reply.body.split("\n", 1)[0] ?? "";
  switch (outcomeOf(reply.body)) {
    case "fixed":
      return `${marker.replace(/^\*\*Fixed\*\*/, "Fixed")} Check whether the fix worked. If the problem is still there, post it again, and say the fix didn't cover it.`;
    case "deferred":
      return `Deferred to #${String(deferredIssueOf(reply.body))}, which plans the work. Don't post it again.`;
    default:
      return "Handled. Don't post it again.";
  }
}
