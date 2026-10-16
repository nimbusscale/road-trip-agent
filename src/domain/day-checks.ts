import type { CheckContext } from "./check-context.js";
import { CheckResult } from "./check-result.js";
import { durationText, placeText, stopText } from "./check-text.js";
import type { Day } from "./day.js";

const MINUTES_IN_HOUR = 60;

// The checks about each day: daily driving and stop order (technical spec section 8).
export function dayCheckResults(context: CheckContext): CheckResult[] {
  return context.itinerary.days.flatMap((day) =>
    [drivingResult(context, day), stopOrderResult(context, day)].filter(
      (result) => result !== null,
    ),
  );
}

// The day's driving: its leg's road time plus the drive buffer, rounded up to the whole
// minute. 0 on a day with no leg.
export function drivingInMinutesOf(context: CheckContext, day: Day): number {
  const roadTime = day.leg?.driveTimeInMinutes ?? 0;
  return Math.ceil(
    (roadTime * (100 + context.settings.driveBufferPercent)) / 100,
  );
}

// When the day's drive hours approval still covers its driving (domain model 4.8).
export function isDriveHoursApprovalApplying(
  context: CheckContext,
  day: Day,
): boolean {
  const hours = approvedHoursOf(day);
  return (
    hours !== null &&
    drivingInMinutesOf(context, day) <= hours * MINUTES_IN_HOUR
  );
}

// A warning when the day drives longer than the brief's comfortable driving hours, or
// longer than the hours the user approved for it. Skipped while the brief has none.
function drivingResult(context: CheckContext, day: Day): CheckResult | null {
  const comfortable = context.tripBrief.comfortableDrivingInHours;
  if (comfortable === null || day.leg === null) {
    return null;
  }
  const driving = drivingInMinutesOf(context, day);
  const approved = approvedHoursOf(day);
  const isApproved = isDriveHoursApprovalApplying(context, day);
  const isOver = driving > comfortable * MINUTES_IN_HOUR;
  if (!isOver && (approved === null || isApproved)) {
    return null;
  }
  const limit =
    approved === null
      ? `Comfortable driving is ${String(comfortable)} hours a day.`
      : `You agreed to ${String(approved)}.`;
  return new CheckResult({
    check: "dailyDriving",
    subjectId: day.id,
    text: `${dayText(context, day)} needs about ${durationText(driving)} of driving. ${limit}`,
    isApproved,
    hasUnselectedStopBefore: false,
  });
}

// A note when Google found a faster order for the day's stops, that saves at least the
// stop-order minimum saving. LegsService works it out when it routes the leg.
function stopOrderResult(context: CheckContext, day: Day): CheckResult | null {
  const leg = day.leg;
  if (leg === null) {
    return null;
  }
  const best = leg.stopsInBestOrder;
  const own = day.stops.filter((stop) => stop.selectedPlace !== null);
  const isSameOrder =
    best.length === own.length &&
    best.every((stop, index) => stop === own[index]);
  if (
    best.length < 2 ||
    isSameOrder ||
    leg.timeSavedInMinutes <
      Math.max(1, context.settings.stopOrderMinimumSavingMinutes)
  ) {
    return null;
  }
  const order = best
    .map((stop) =>
      stop.selectedPlace === null
        ? stopText(stop)
        : placeText(stop.selectedPlace),
    )
    .join(", then ");
  return new CheckResult({
    check: "stopOrder",
    subjectId: day.id,
    text: `On ${dayText(context, day)}, a faster order saves about ${String(leg.timeSavedInMinutes)} minutes: ${order}.`,
    isApproved: false,
    hasUnselectedStopBefore: false,
  });
}

function approvedHoursOf(day: Day): number | null {
  for (const approval of day.approvals) {
    if (approval.kind === "driveHours") {
      return approval.approvedDrivingInHours;
    }
  }
  return null;
}

// Such as "Day 4", counting from 1 for people (domain model section 1).
function dayText(context: CheckContext, day: Day): string {
  return `Day ${String(context.calendar.orderOf(context.itinerary, day) + 1)}`;
}
