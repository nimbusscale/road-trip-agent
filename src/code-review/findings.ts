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

// Each label's rule, as the review rubric's table gives it. A posted finding names its
// rule after its label, so Joe doesn't have to look it up. A test checks these against
// the table.
const RULES: ReadonlyMap<Label, string> = new Map<Label, string>([
  [
    "V1",
    "The label depends on a fact the reviewer can't check from the repo, and that fact decides whether it's a fix",
  ],
  ["D1", "The claim about the code is false"],
  [
    "D2",
    "The code does what the design asks, and the finding would have it done another way",
  ],
  [
    "D3",
    "The PR puts off work, and hands it to another issue that names the work",
  ],
  ["F1", "The PR doesn't do what its task says"],
  ["F2", "The app does the wrong thing, crashes, or hangs, in normal use"],
  ["F3", "Text a road trip agent reads says something false, in normal use"],
  ["F4", "Data is lost or corrupted, in normal use"],
  ["F5", "A security hole within the project's threat model"],
  [
    "F6",
    "A design doc is wrong, so an agent building from it would build the wrong thing",
  ],
  ["F7", "A test is wrong"],
  [
    "NF2",
    "The app does the wrong thing, crashes, or hangs, but not in normal use",
  ],
  [
    "NF3",
    "Text a road trip agent reads says something false, but not in normal use",
  ],
  ["NF4", "Data is lost or corrupted, but not in normal use"],
  ["NF5", "A security hole outside the threat model"],
  ["N1", "Cleaner code"],
  ["N2", "A missing test"],
  [
    "N3",
    "Text a road trip agent reads is unclear, or says something twice, or is an error message with the wrong reason for a failure",
  ],
  ["N4", "Advice about code that isn't written yet"],
  ["N5", "A code comment is wrong"],
  [
    "N6",
    "A design doc is unclear, or doesn't match the code, in a way no builder would act on",
  ],
]);

export function ruleOf(label: Label): string {
  const rule = RULES.get(label);
  if (rule === undefined) {
    throw new Error(`The label ${label} has no rule.`);
  }
  return rule;
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
    `**${kindOf(finding.label)} (${finding.label} - ${ruleOf(finding.label)})**`,
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
