import type { CheckComparison } from "../domain/feasibility-checker.js";
import type { CheckResult } from "../domain/check-result.js";

// The check results part of a write's reply (tool design, section 2.1): every result
// that's new, changed, or gone, anywhere in the trip, and the already-known ones whose
// subject the write touched. `touchedIds` holds those subjects' IDs, always with the
// itinerary's, which stands for the trip as a whole.
export function checkResultLines(
  comparison: CheckComparison,
  touchedIds: ReadonlySet<string>,
): string[] {
  const lines = [
    ...comparison.newResults.map((result) => `- ${describe("New", result)}`),
    ...comparison.changedResults.map(
      (result) => `- ${describe("Changed", result)}`,
    ),
    ...comparison.knownResults
      .filter((result) => touchedIds.has(result.subjectId))
      .map((result) => `- ${describe("Already known", result)}`),
    ...comparison.goneResults.map((result) => `- ${describeGone(result)}`),
  ];
  return lines.length === 0
    ? [
        "No check results are new or changed, and this change fixed or cleared none.",
      ]
    : ["Check results:", ...lines];
}

// A gone result's saved text still reads like a problem that's there, so the line says
// first that this change ended it, and quotes the text as what was true before. Judges
// read "Gone:" and "No longer applies:" lines as open warnings (#252). A note isn't a
// problem, so it's cleared, not fixed.
function describeGone(result: CheckResult): string {
  const verb = result.level === "warning" ? "Fixed" : "Cleared";
  return `${verb} by this change: the earlier ${result.level} that said "${result.text}"`;
}

// Such as "New warning, approved: ...". An opening-hours warning with a stop before it
// that has no place yet is marked "may be too early", since that stop will take time
// once it has one (technical spec 5.2). read_itinerary marks its results the same way.
export function describe(status: string, result: CheckResult): string {
  const marks = [
    ...(result.isApproved ? ["approved"] : []),
    ...(result.hasUnselectedStopBefore ? ["may be too early"] : []),
  ];
  return `${[`${status} ${result.level}`, ...marks].join(", ")}: ${result.text}`;
}
