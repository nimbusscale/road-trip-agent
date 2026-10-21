import type { Finding, Label } from "./review-result.schema.js";

// The three kinds a posted finding is marked as, and the D labels that aren't posted
// (code review design section 4.2). The kind comes from the label, so the reviewer
// gives only the label.
export type Kind = "Fix" | "Check" | "Note" | "Not posted";

const KIND_ORDER: readonly Kind[] = ["Fix", "Check", "Note", "Not posted"];

export function kindOf(label: Label): Kind {
  if (label === "V1") {
    return "Check";
  }
  if (label.startsWith("D")) {
    return "Not posted";
  }
  return label.startsWith("F") ? "Fix" : "Note";
}

// The posted findings, fixes first, then checks, then notes.
export function postedFindings(findings: readonly Finding[]): Finding[] {
  return findings
    .filter((finding) => kindOf(finding.label) !== "Not posted")
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(kindOf(a.label)) -
        KIND_ORDER.indexOf(kindOf(b.label)),
    );
}

// The text of an inline comment.
export function commentBody(finding: Finding): string {
  return [
    `**${kindOf(finding.label)} (${finding.label})**`,
    finding.finding,
    `**Why ${finding.label}:** ${finding.labelReason}`,
  ].join("\n\n");
}

// A file-level comment doesn't point to a line, so its text names it.
export function fileCommentBody(finding: Finding): string {
  return `Line ${String(finding.line)}.\n\n${commentBody(finding)}`;
}

// The review body that holds the findings on files the PR doesn't change. GitHub takes
// comments only on files in the PR's diff.
export function outsideDiffBody(findings: readonly Finding[]): string {
  const sections = findings.map(
    (finding) =>
      `### \`${finding.file}:${String(finding.line)}\`\n\n${commentBody(finding)}`,
  );
  return [
    "These findings are on files this PR doesn't change, so they can't be inline comments.",
    ...sections,
  ].join("\n\n");
}

// The list of findings that weren't posted, for Joe to check the D labels (code review
// design section 4.2).
export function notPostedList(findings: readonly Finding[]): string {
  const lines = findings
    .filter((finding) => kindOf(finding.label) === "Not posted")
    .map(
      (finding) =>
        `- \`${finding.file}:${String(finding.line)}\`, ${finding.label}: ${finding.labelReason}\n` +
        `  - The finding: ${finding.finding}`,
    );
  return lines.length === 0 ? "None.\n" : `${lines.join("\n")}\n`;
}

// One line with how many findings of each kind there were.
export function countLine(findings: readonly Finding[]): string {
  return KIND_ORDER.map((kind) => {
    const count = findings.filter((f) => kindOf(f.label) === kind).length;
    return `${kind}: ${String(count)}.`;
  }).join(" ");
}
