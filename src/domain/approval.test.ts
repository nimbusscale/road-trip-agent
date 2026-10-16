import { describe, expect, it } from "vitest";

import {
  checkedApprovals,
  DriveHoursApproval,
  OpeningHoursApproval,
  RouteTypeApproval,
  withApproval,
} from "./approval.js";
import { CheckResult, type CheckResultFields } from "./check-result.js";
import { RuleError } from "./rule-error.js";

const FIVE_HOURS = new DriveHoursApproval({
  reason: "we want to see the hoodoos",
  approvedDrivingInHours: 5,
});
const FASTEST = new RouteTypeApproval({
  reason: "get home quickly",
  approvedRouteType: "fastest",
});

describe("Approval", () => {
  it("needs a reason", () => {
    expect(
      () => new DriveHoursApproval({ reason: " ", approvedDrivingInHours: 5 }),
    ).toThrow("reason");
    expect(
      () => new RouteTypeApproval({ reason: "", approvedRouteType: "scenic" }),
    ).toThrow(RuleError);
  });

  it("approves more than 0 hours of driving", () => {
    expect(
      () => new DriveHoursApproval({ reason: "ok", approvedDrivingInHours: 0 }),
    ).toThrow("more than 0");
  });

  it("approves 0 or more whole minutes of opening hours", () => {
    const closed = new OpeningHoursApproval({
      reason: "we'll look from outside",
      approvedOpenTimeInMinutes: 0,
    });
    expect(closed.kind).toBe("openingHours");
    expect(
      () =>
        new OpeningHoursApproval({
          reason: "ok",
          approvedOpenTimeInMinutes: -1,
        }),
    ).toThrow(RuleError);
  });

  it("replaces one of the same kind, so a holder has at most one of each", () => {
    const sixHours = new DriveHoursApproval({
      reason: "a long day",
      approvedDrivingInHours: 6,
    });
    expect(withApproval([FIVE_HOURS, FASTEST], sixHours)).toEqual([
      FASTEST,
      sixHours,
    ]);
    expect(() => checkedApprovals([FIVE_HOURS, sixHours])).toThrow(
      "at most one approval of each kind",
    );
  });
});

const MILTS_WARNING: CheckResultFields = {
  check: "openingHoursNotLongEnough",
  subjectId: "stop_k7m2x9qa",
  text: "Milt's closes at 12:30 p.m.",
  isApproved: false,
  hasUnselectedStopBefore: true,
};

describe("CheckResult", () => {
  it("gets its level from its check", () => {
    expect(new CheckResult(MILTS_WARNING).level).toBe("warning");
    const note = new CheckResult({
      ...MILTS_WARNING,
      check: "openingHoursNotKnown",
      hasUnselectedStopBefore: false,
    });
    expect(note.level).toBe("note");
  });

  it("can have an unselected stop before only for the two opening-hours warnings", () => {
    expect(
      new CheckResult({ ...MILTS_WARNING, check: "openingHoursClosed" })
        .hasUnselectedStopBefore,
    ).toBe(true);
    expect(
      () => new CheckResult({ ...MILTS_WARNING, check: "lateForSetTime" }),
    ).toThrow("Only the two opening-hours warnings");
  });
});
