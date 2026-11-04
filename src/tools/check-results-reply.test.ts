import { describe, expect, it } from "vitest";

import { CheckResult } from "../domain/check-result.js";
import { checkResultLines } from "./check-results-reply.js";

function result(
  fields: Partial<ConstructorParameters<typeof CheckResult>[0]>,
): CheckResult {
  return new CheckResult({
    check: "dailyDriving",
    subjectId: "day_a",
    text: "Day 2 has 7 h of driving, over the comfortable 6 h.",
    isApproved: false,
    hasUnselectedStopBefore: false,
    ...fields,
  });
}

describe("checkResultLines", () => {
  it("gives every new, changed, and gone result, and the known ones for what the write touched", () => {
    const lines = checkResultLines(
      {
        newResults: [result({ check: "stopOrder", text: "A faster order." })],
        changedResults: [
          result({
            subjectId: "day_d",
            text: "Day 5 has 6 h of driving, over the comfortable 5 h.",
          }),
        ],
        knownResults: [
          result({ isApproved: true }),
          result({ subjectId: "day_b", text: "Not touched." }),
        ],
        goneResults: [
          result({ subjectId: "day_c", text: "Day 4 was late." }),
          result({ check: "stopOrder", text: "A faster order." }),
        ],
      },
      new Set(["day_a"]),
    );
    expect(lines).toEqual([
      "Check results:",
      "- New note: A faster order.",
      "- Changed warning: Day 5 has 6 h of driving, over the comfortable 5 h.",
      "- Already known warning, approved: Day 2 has 7 h of driving, over the comfortable 6 h.",
      '- Fixed by this change: the earlier warning that said "Day 4 was late."',
      '- Cleared by this change: the earlier note that said "A faster order."',
    ]);
  });

  it("marks an opening-hours warning that may be too early", () => {
    const lines = checkResultLines(
      {
        newResults: [
          result({
            check: "openingHoursClosed",
            text: "Milt's is closed then.",
            hasUnselectedStopBefore: true,
          }),
        ],
        changedResults: [],
        knownResults: [],
        goneResults: [],
      },
      new Set(),
    );
    expect(lines).toContain(
      "- New warning, may be too early: Milt's is closed then.",
    );
  });

  it("says so when nothing is new, changed, or gone, and nothing touched is known", () => {
    expect(
      checkResultLines(
        {
          newResults: [],
          changedResults: [],
          knownResults: [result({})],
          goneResults: [],
        },
        new Set(["itin_a"]),
      ),
    ).toEqual([
      "No check results are new or changed, and this change fixed or cleared none.",
    ]);
  });
});
