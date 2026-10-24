import type { Day } from "../domain/day.js";
import type { DaysService } from "../domain/days-service.js";
import type { Itinerary } from "../domain/itinerary.js";
import { RuleError } from "../domain/rule-error.js";
import { StayDay } from "../domain/stay-day.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { timeOfDayFromClockText } from "./clock-time.js";
import { refuseWrongKind } from "./id-kind.js";
import {
  type ChangeOutcome,
  dayName,
  itineraryWriteReply,
  refuseNoChange,
} from "./itinerary-write.js";
import {
  NO_TIME,
  SET_WAYPOINTS_INPUT,
  updateDayInput,
  type UpdateDayInput,
} from "./skeleton-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { dayIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";

// The tools that change a day, and set its waypoints (tool design 2.1).

export const UPDATE_DAY_DESCRIPTION =
  "Changes a day: whether it's a rest day, its start time, and its approvals. Items not given are not changed. Only a day that starts and ends at the same stay can be a rest day, and every stop on it needs a set time. Marking a rest day removes the day's leg and its waypoints. An approval replaces any of the same kind the day has, and needs the user's reason. The reply gives any leg that changed.";

export const SET_WAYPOINTS_DESCRIPTION =
  "Sets a day's waypoints: places its drive passes through without stopping, to steer the route, such as onto a scenic road. Replaces any the day had. An empty list clears them. Code places each one among the day's selected stops, where it adds the least distance. Refused for a day with no leg, such as a rest day, or a day that stays put with no selected stop yet. The reply gives the leg's new road time.";

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
        if (new Set(waypoints).size !== waypoints.length) {
          throw new RuleError("Give each waypoint once.");
        }
        day.setWaypoints(
          waypoints.map((placeId) => {
            refuseWrongKind(placeId, "place");
            return placeOf(placeId);
          }),
        );
        const count =
          waypoints.length === 1
            ? "1 waypoint"
            : `${String(waypoints.length)} waypoints`;
        return {
          lines: [
            waypoints.length === 0
              ? `Cleared the waypoints on ${dayName(itinerary, day)}.`
              : `Set ${count} on ${dayName(itinerary, day)}.`,
          ],
          touchedIds: [day.id],
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
      startTime === NO_TIME ? null : timeOfDayFromClockText(startTime);
  }
  if (input.removeApproval !== undefined) {
    services.days.removeApproval(day, input.removeApproval);
  }
  if (approveDriveHours !== undefined) {
    const { hours, reason } = approveDriveHours;
    services.days.approveDriveHours(day, hours, reason);
  }
  if (approveRouteType !== undefined) {
    const { routeType, reason } = approveRouteType;
    services.days.approveRouteType(day, routeType, reason);
  }
  return {
    lines: [`Changed ${dayName(itinerary, day)}.`],
    touchedIds: [day.id],
  };
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
