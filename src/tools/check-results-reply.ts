import type { CheckComparison } from "../domain/feasibility-checker.js";
import type { CheckResult } from "../domain/check-result.js";

// The check results part of a write's reply (tool design, section 2.1): every result
// that's new or gone, anywhere in the trip, and the already-known ones whose subject the
// write touched. `touchedIds` holds those subjects' IDs, always with the itinerary's,
// which stands for the trip as a whole.
export function checkResultLines(
  comparison: CheckComparison,
  touchedIds: ReadonlySet<string>,
): string[] {
  const lines = [
    ...comparison.newResults.map((result) => `- ${describe("New", result)}`),
    ...comparison.knownResults
      .filter((result) => touchedIds.has(result.subjectId))
      .map((result) => `- ${describe("Already known", result)}`),
    ...comparison.goneResults.map((result) => `- Gone: ${result.text}`),
  ];
  return lines.length === 0
    ? ["No new or gone check results."]
    : ["Check results:", ...lines];
}

// Such as "New warning, approved: ...". An opening-hours warning with a stop before it
// that has no place yet is marked "may be too early", since that stop will take time
// once it has one (technical spec 5.2).
function describe(status: string, result: CheckResult): string {
  const marks = [
    ...(result.isApproved ? ["approved"] : []),
    ...(result.hasUnselectedStopBefore ? ["may be too early"] : []),
  ];
  return `${[`${status} ${result.level}`, ...marks].join(", ")}: ${result.text}`;
}
