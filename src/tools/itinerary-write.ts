import type { Calendar } from "../domain/calendar.js";
import { durationText } from "../domain/check-text.js";
import { type Day, describeStopAndPlace } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Leg } from "../domain/leg.js";
import type { LegChange } from "../domain/legs-service.js";
import { RuleError } from "../domain/rule-error.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { checkResultLines } from "./check-results-reply.js";
import {
  type ToolReply,
  textReply,
  writeReplyOrReadableError,
} from "./tool-reply.js";
import type { TripSession } from "./trip-session.js";

// How a coordinator tool that changes the itinerary writes, and builds its reply from
// what the write hands back (tool design 2.1, "Writing").

// What a tool's change says about itself, for the reply.
export interface ChangeOutcome {
  // What the change did, in words, such as the IDs of the days it added. Not an echo of
  // the inputs.
  readonly lines: readonly string[];
  // The IDs of the stops, days, and stays the call names, and those the change returned
  // as changed.
  readonly touchedIds: readonly string[];
}

// Where a day starts and ends, by the places its leg runs between.
interface DayEnds {
  readonly fromId: string | undefined;
  readonly toId: string | undefined;
}

// Runs the change as a coordinator write. The reply gives what the change did, the
// stops on each day whose start or end it changed (domain model 4.4), each leg the
// finish added, re-routed, or removed, and the check results.
export function itineraryWriteReply(
  session: TripSession,
  change: (context: ChangeContext) => ChangeOutcome | Promise<ChangeOutcome>,
): Promise<ToolReply> {
  return writeReplyOrReadableError(async () => {
    const result = await session.writer.write(
      session.tripId,
      "coordinator",
      async (context) => {
        const itinerary = context.trip.itinerary;
        const before = endsOfDays(context.calendar, itinerary);
        const outcome = await change(context);
        const moved = daysWithNewEnds(context.calendar, itinerary, before);
        return { outcome, itinerary, moved, calendar: context.calendar };
      },
    );
    const { outcome, itinerary, moved, calendar } = result.changeResult;
    const touchedIds = new Set([
      itinerary.id,
      ...outcome.touchedIds,
      ...moved.map((day) => day.id),
      ...result.legChanges.map((legChange) => legChange.day.id),
    ]);
    return textReply([
      ...outcome.lines,
      ...movedLines(calendar, itinerary, moved),
      ...legChangeLines(itinerary, result.legChanges),
      ...(result.checkComparison === null
        ? []
        : checkResultLines(result.checkComparison, touchedIds)),
    ]);
  });
}

// An update tool refuses a call that changes nothing, as update_trip_brief does.
export function refuseNoChange(
  changes: readonly unknown[],
  message: string,
): void {
  if (changes.every((change) => change === undefined)) {
    throw new RuleError(message);
  }
}

// Such as "Day 3 (day_…)". Days are counted from 1 (domain model section 1).
export function dayName(itinerary: Itinerary, day: Day): string {
  return `Day ${String(itinerary.days.indexOf(day) + 1)} (${day.id})`;
}

function endsOfDays(
  calendar: Calendar,
  itinerary: Itinerary,
): ReadonlyMap<Day, DayEnds> {
  return new Map(
    itinerary.days.map((day) => [day, endsOf(calendar, itinerary, day)]),
  );
}

function endsOf(calendar: Calendar, itinerary: Itinerary, day: Day): DayEnds {
  return {
    fromId: calendar.fromPlaceOf(itinerary, day)?.id,
    toId: calendar.toPlaceOf(itinerary, day)?.id,
  };
}

// The days that were there before the change, hold stops, and now start or end
// somewhere else. Each keeps its stops, since which day a stop belongs on is a judgment
// call (domain model 4.4). A new day has no stops.
function daysWithNewEnds(
  calendar: Calendar,
  itinerary: Itinerary,
  before: ReadonlyMap<Day, DayEnds>,
): Day[] {
  return itinerary.days.filter((day) => {
    const old = before.get(day);
    if (old === undefined || day.stops.length === 0) {
      return false;
    }
    const now = endsOf(calendar, itinerary, day);
    return now.fromId !== old.fromId || now.toId !== old.toId;
  });
}

// Such as "Day 4 (day_…) now runs Big Sur → San Luis Obispo, and still holds: …".
function movedLines(
  calendar: Calendar,
  itinerary: Itinerary,
  moved: readonly Day[],
): string[] {
  if (moved.length === 0) {
    return [];
  }
  return [
    "Days that now start or end somewhere else. Each kept its stops:",
    ...moved.map((day) => {
      const location = calendar.locationOf(itinerary, day) ?? "";
      const stops = day.stops.map(describeStopAndPlace).join("; ");
      return `- ${dayName(itinerary, day)} now runs ${location}, and still holds: ${stops}.`;
    }),
  ];
}

// Such as "- Day 2 (day_…): 2 h 10 m → 1 h 30 m, 95.2 miles." Road time is without the
// drive buffer, as in read_itinerary.
function legChangeLines(
  itinerary: Itinerary,
  legChanges: readonly LegChange[],
): string[] {
  if (legChanges.length === 0) {
    return [];
  }
  return [
    "Road time changed, without the drive buffer:",
    ...legChanges.map(
      ({ day, oldLeg, newLeg }) =>
        `- ${dayName(itinerary, day)}: ${legText(oldLeg)} → ${legText(newLeg)}${newLeg === null ? "" : `, ${String(newLeg.distanceInMiles)} miles`}.`,
    ),
  ];
}

function legText(leg: Leg | null): string {
  return leg === null ? "no leg" : durationText(leg.driveTimeInMinutes);
}
