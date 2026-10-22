import { deferredIssueOf, findingTag, taggedFindingId } from "./fix-markers.js";
import {
  FIXER_BOT,
  lastFixerReply,
  lastOutcome,
  type PostedFinding,
  whereOf,
} from "./fix-round.js";
import type { IssueComment, ReviewThread } from "./github-pr.schema.js";

// The summary comment lists the findings Joe has to look at: the ones deferred, and
// the ones that need attention (code review design section 4.4). Its first line tags
// it, so code finds it again to update it.
export const SUMMARY_TAG = findingTag("summary");

export function summaryComment(
  issueComments: readonly IssueComment[],
): IssueComment | null {
  return (
    issueComments.find(
      (c) => c.author === FIXER_BOT && c.body.startsWith(SUMMARY_TAG),
    ) ?? null
  );
}

// The findings in a review body whose boxes Joe ticked in the summary.
export function tickedIds(summaryBody: string): Set<string> {
  const ids = summaryBody
    .split("\n")
    .filter((line) => line.startsWith("- [x] "))
    .map(taggedFindingId)
    .filter((id) => id !== null);
  return new Set(ids);
}

// A finding leaves the summary when its thread is resolved. One in a review body has no
// thread, so it has a box instead, and a ticked box stays ticked.
export function summaryBody(
  findings: readonly PostedFinding[],
  threads: readonly ReviewThread[],
  ticked: ReadonlySet<string>,
): string {
  const resolved = new Set(
    threads.filter((t) => t.isResolved).map((t) => t.firstCommentId),
  );
  const open = findings.filter(
    (f) => f.threadCommentId === null || !resolved.has(f.threadCommentId),
  );
  const lines = (outcome: "deferred" | "needs_attention") =>
    open
      .filter((f) => lastOutcome(f) === outcome)
      .map((f) => summaryLine(f, ticked));
  const deferred = lines("deferred");
  const needsAttention = lines("needs_attention");
  return [
    SUMMARY_TAG,
    "## Fix loop: deferred, and needs attention",
    "Code updates this comment after each fix round. Resolve a finding's thread once it's handled. A finding in a review body has no thread, so tick its box instead.",
    "**Deferred**",
    deferred.length === 0 ? "None." : deferred.join("\n"),
    "**Needs attention**",
    needsAttention.length === 0 ? "None." : needsAttention.join("\n"),
  ].join("\n\n");
}

function summaryLine(
  finding: PostedFinding,
  ticked: ReadonlySet<string>,
): string {
  const reply = lastFixerReply(finding);
  const issue = reply === null ? null : deferredIssueOf(reply.body);
  const where = whereOf(finding);
  const links = [
    `[finding](${finding.url})`,
    ...(reply === null ? [] : [`[reply](${reply.url})`]),
    ...(issue === null ? [] : [`#${String(issue)}`]),
  ].join(", ");
  const line = `${firstSentence(finding.text)} (\`${where}\`): ${links}`;
  if (finding.threadCommentId !== null) {
    return `- ${line}`;
  }
  const box = ticked.has(finding.id) ? "[x]" : "[ ]";
  return `- ${box} ${line} ${findingTag(finding.id)}`;
}

// A few words to name the finding by: its first sentence, without its period, and cut
// short when it's long.
function firstSentence(text: string): string {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const sentence = (
    /^.*?[.!?](?=\s|$)/.exec(firstLine)?.[0] ?? firstLine
  ).replace(/\.$/, "");
  if (sentence.length <= 100) {
    return sentence;
  }
  // A cut inside a code span would leave its backtick open, and break the line.
  const cut = sentence.slice(0, 99).trimEnd();
  const openTick = (cut.match(/`/g)?.length ?? 0) % 2 === 1 ? "`" : "";
  return `${cut}${openTick}…`;
}
