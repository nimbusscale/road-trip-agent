import type { Day } from "../domain/day.js";
import type { DaysService } from "../domain/days-service.js";
import type { Itinerary } from "../domain/itinerary.js";
import { RuleError } from "../domain/rule-error.js";
import { StayDay } from "../domain/stay-day.js";
import { Waypoint } from "../domain/waypoint.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { timeOfDayFromClockText } from "./clock-time.js";
import { waypointText } from "./day-lines.js";
import { refuseWrongKind } from "./id-kind.js";
import {
  type ChangeOutcome,
  dayName,
  itineraryWriteReply,
  refuseNoChange,
} from "./itinerary-write.js";
import {
  DEFAULT_START_TIME,
  SET_WAYPOINTS_INPUT,
  updateDayInput,
  type UpdateDayInput,
} from "./skeleton-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { dayIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";

// The tools that change a day, and set its waypoints (tool design 2.1).

export const UPDATE_DAY_DESCRIPTION =
  "Changes a day: whether it's a rest day, its start time, and its approvals. Items not given are not changed. Only a day that starts and ends at the same stay can be a rest day, and every stop on it needs a set time. Marking a rest day removes the day's leg and its waypoints. An approval replaces any of the same kind the day has, and needs the user's reason. Approving fastest clears the day's waypoints, and the reply lists each one it cleared, with its reason. Approving scenic leaves them. The reply gives any leg that changed, with its new road time.";

// What a waypoint is, and what its reason is for, is in the coordinator's instructions
// (tool design, section 4).
export const SET_WAYPOINTS_DESCRIPTION =
  "Sets a day's waypoints, replacing any the day had. Each is a place and its reason. An empty list clears them. Code places each one among the day's selected stops, where it adds the least distance. Refused for a day with no leg, such as a rest day, or a day that stays put with no selected stop yet. The reply lists each waypoint with its reason, and gives the leg's road time before and after.";

export function updateDayTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "update_day",
    UPDATE_DAY_DESCRIPTION,
    updateDayInput(session.settings),
    (input) =>
      itineraryWriteReply(session, (context) => updateDay(input, context)),
  );
}

export function setWaypointsTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "set_waypoints",
    SET_WAYPOINTS_DESCRIPTION,
    SET_WAYPOINTS_INPUT,
    ({ dayId, waypoints }) =>
      itineraryWriteReply(session, ({ trip, placeOf }) => {
        const itinerary = trip.itinerary;
        const day = dayIn(itinerary, dayId);
        const placeIds = waypoints.map((waypoint) => waypoint.placeId);
        if (new Set(placeIds).size !== placeIds.length) {
          throw new RuleError("Give each waypoint once.");
        }
        day.setWaypoints(
          waypoints.map(({ placeId, reason }) => {
            refuseWrongKind(placeId, "place");
            return new Waypoint({ place: placeOf(placeId), reason });
          }),
        );
        return {
          lines:
            waypoints.length === 0
              ? [`Cleared the waypoints on ${dayName(itinerary, day)}.`]
              : [
                  `Set ${waypointCount(waypoints.length)} on ${dayName(itinerary, day)}:`,
                  ...waypointLines(day.waypoints),
                ],
          touchedIds: [day.id],
          roadTimeDay: day,
        };
      }),
  );
}

// The approval to remove goes before the new ones, so a call can't remove one it set.
function updateDay(
  input: UpdateDayInput,
  { trip, services }: ChangeContext,
): ChangeOutcome {
  const { isRestDay, startTime, approveDriveHours, approveRouteType } = input;
  refuseNoChange(
    [
      isRestDay,
      startTime,
      approveDriveHours,
      approveRouteType,
      input.removeApproval,
    ],
    "Give at least one change: isRestDay, startTime, approveDriveHours, approveRouteType, or removeApproval.",
  );
  const itinerary = trip.itinerary;
  const day = dayIn(itinerary, input.dayId);
  if (isRestDay !== undefined) {
    setRestDay(services.days, itinerary, day, isRestDay);
  }
  if (startTime !== undefined) {
    day.ownStartTime =
      startTime === DEFAULT_START_TIME
        ? null
        : timeOfDayFromClockText(startTime);
  }
  if (input.removeApproval !== undefined) {
    services.days.removeApproval(day, input.removeApproval);
  }
  if (approveDriveHours !== undefined) {
    const { hours, reason } = approveDriveHours;
    services.days.approveDriveHours(day, hours, reason);
  }
  const cleared =
    approveRouteType === undefined
      ? []
      : services.days.approveRouteType(
          day,
          approveRouteType.routeType,
          approveRouteType.reason,
        );
  return {
    lines: [`Changed ${dayName(itinerary, day)}.`, ...clearedLines(cleared)],
    touchedIds: [day.id],
  };
}

// The coordinator puts back the ones it still needs, from their reasons (technical spec
// 5.2).
function clearedLines(cleared: readonly Waypoint[]): string[] {
  if (cleared.length === 0) {
    return [];
  }
  return [
    `Approving fastest cleared the day's ${waypointCount(cleared.length)}:`,
    ...waypointLines(cleared),
  ];
}

function waypointLines(waypoints: readonly Waypoint[]): string[] {
  return waypoints.map((waypoint) => `- ${waypointText(waypoint)}`);
}

function waypointCount(count: number): string {
  return count === 1 ? "1 waypoint" : `${String(count)} waypoints`;
}

// The last day ends at the end place with no night, so it's never a rest day (domain
// model 3.6).
function setRestDay(
  days: DaysService,
  itinerary: Itinerary,
  day: Day,
  isRestDay: boolean,
): void {
  if (day instanceof StayDay) {
    days.setRestDay(itinerary, day, isRestDay);
  } else if (isRestDay) {
    throw new RuleError(
      "The last day can't be a rest day, since it drives to the end place.",
    );
  }
}
