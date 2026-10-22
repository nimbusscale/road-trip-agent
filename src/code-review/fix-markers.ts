import type { Outcome } from "./fix-answer.schema.js";

// Each fixer reply starts with a marker line that says the outcome (code review design
// section 3.6). Code writes it from the fixer's answer, and reads it back to resolve
// threads, keep the summary, and show the next fixer what was done.

export function markerLine(
  outcome: Outcome,
  commit: string | null,
  issue: number | null,
): string {
  switch (outcome) {
    case "fixed":
      return `**Fixed** in ${commit ?? "?"}.`;
    case "deferred":
      return `**Deferred:** #${String(issue ?? "?")}.`;
    case "below_the_bar":
      return "**Not fixed:** below the bar.";
    case "wrong":
      return "**Not fixed:** wrong.";
    case "needs_attention":
      return "**Needs attention.**";
  }
}

const MARKER_PATTERNS: readonly [RegExp, Outcome][] = [
  [/^\*\*Fixed\*\* in [0-9a-f]{7,40}\.$/, "fixed"],
  [/^\*\*Deferred:\*\* #\d+\.$/, "deferred"],
  [/^\*\*Not fixed:\*\* below the bar\.$/, "below_the_bar"],
  [/^\*\*Not fixed:\*\* wrong\.$/, "wrong"],
  [/^\*\*Needs attention\.\*\*$/, "needs_attention"],
];

// The outcome a reply's first line gives, or null for a reply with no marker, such as
// one of Joe's.
export function outcomeOf(replyBody: string): Outcome | null {
  const firstLine = replyBody.split("\n", 1)[0]?.trim() ?? "";
  return (
    MARKER_PATTERNS.find(([pattern]) => pattern.test(firstLine))?.[1] ?? null
  );
}

// A deferred reply's issue number.
export function deferredIssueOf(replyBody: string): number | null {
  const match = /^\*\*Deferred:\*\* #(\d+)\./.exec(replyBody);
  return match?.[1] === undefined ? null : Number(match[1]);
}

// A hidden line that ties a conversation comment to a finding in a review body, which
// has no thread of its own.
export function findingTag(findingId: string): string {
  return `<!-- fix-loop: ${findingId} -->`;
}

export function taggedFindingId(body: string): string | null {
  return /<!-- fix-loop: (\S+) -->/.exec(body)?.[1] ?? null;
}
