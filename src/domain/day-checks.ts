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

// When the day's drive hours approval still covers its driving (domain model 4.8).
export function isDriveHoursApprovalApplying(
  context: CheckContext,
  day: Day,
): boolean {
  const hours = approvedHoursOf(day);
  const driving = context.calendar.drivingInMinutesOf(context.itinerary, day);
  return (
    hours !== null && driving !== null && driving <= hours * MINUTES_IN_HOUR
  );
}

// A warning when the day drives longer than the brief's comfortable driving hours, or
// longer than the hours the user approved for it.
function drivingResult(context: CheckContext, day: Day): CheckResult | null {
  const comfortable = context.tripBrief.comfortableDrivingInHours;
  const driving = context.calendar.drivingInMinutesOf(context.itinerary, day);
  if (day.leg === null || driving === null) {
    return null;
  }
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
  const { itinerary, calendar } = context;
  const best = leg.stopsInBestOrder;
  const own = day.stops.filter(
    (stop) => calendar.placeOf(itinerary, stop) !== null,
  );
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
    .map((stop) => {
      const place = calendar.placeOf(itinerary, stop);
      return place === null ? stopText(stop) : placeText(place);
    })
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
