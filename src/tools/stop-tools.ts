import { durationText } from "../domain/check-text.js";
import type { Itinerary } from "../domain/itinerary.js";
import { RuleError } from "../domain/rule-error.js";
import type { ScheduleTime } from "../domain/schedule-time.js";
import { newStop, type Stop } from "../domain/stop.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { scheduleTimeFromText } from "./clock-time.js";
import {
  type ChangeOutcome,
  dayName,
  itineraryWriteReply,
  refuseNoChange,
} from "./itinerary-write.js";
import { stopName } from "./spot-names.js";
import {
  ADD_STOPS_INPUT,
  MOVE_STOP_INPUT,
  NAMED_SEARCH_AREA_TEXT,
  NAMED_SEARCH_AREAS,
  NO_SET_TIME,
  type NewStopInput,
  REMOVE_STOPS_INPUT,
  UPDATE_STOP_INPUT,
  type UpdateStopInput,
} from "./stop-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { dayIn, FIRST, stayIn, stopAfter, stopIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";

// The tools that lay out a day's stops, and change, move, and remove them (tool design
// 2.1). What a stop, a set time, and a search area are is in the coordinator's
// instructions (tool design, section 4).

// A description names the after input, and says what "first" does (tool design 2.1,
// "Where an item goes").
export function addStopsDescription(checkInVisitMinutes: number): string {
  return `Adds stops to a day, in order. Lay out a whole day in one call. Give after the ID of the stop they follow on that day, or "${FIRST}" to put them before every other stop on the day. A meal or an attraction starts empty. A stop near a stay has to be on a day that starts or ends at that stay. "alongLeg" is refused on a day that stays put, "nearStartPlace" except on the first day, and "nearEndPlace" except on the last day. A check-in is at the stay the party sleeps at that night: its lodging once one is selected, and its town until then. It takes no search area, has no candidates, and gets a visit time of ${durationText(checkInVisitMinutes)}. It's refused on the last day, which has no stay, and a day holds at most one. If any stop is refused, none is added. The reply gives the new stops' IDs, in order.`;
}

export const UPDATE_STOP_DESCRIPTION =
  "Changes a stop's set time, visit time, tier, or opening hours approval. Items not given are not changed. A visit time needs a selected place, or a check-in, and only a meal has a tier. An opening hours approval needs the user's reason, and records how many minutes of the visit fall within the selected place's opening hours. The set time and visit time change first, so an approval in the same call records the minutes at the new times.";

export const MOVE_STOP_DESCRIPTION = `Moves a stop within its day or to another day. Give after the ID of the stop it follows on that day, or "${FIRST}" to put it before every other stop on the day. The set time is always given, so an old one never carries over. The stop keeps its candidates, selected place, visit time, and approvals. A stop along the leg can't move to a day that stays put: remove it and add a new one instead. A stop near a stay, or near the start or end place, can move to a day that doesn't start or end there, and the check results warn that its search area doesn't fit the day. A check-in moves to the stay the party sleeps at on its new day. It can't move to the last day, or to a day that already holds one.`;

export const REMOVE_STOPS_DESCRIPTION =
  "Removes stops, with their candidates and approvals. The stops can be on different days. If any stop isn't in the trip, none is removed.";

export function addStopsTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "add_stops",
    addStopsDescription(session.settings.checkInVisitMinutes),
    ADD_STOPS_INPUT,
    ({ dayId, after, stops }) =>
      itineraryWriteReply(session, ({ trip, services, calendar }) => {
        const itinerary = trip.itinerary;
        const day = dayIn(itinerary, dayId);
        const added = stops.map((input) =>
          input.kind === "checkIn"
            ? services.stops.newCheckIn(
                input.purpose,
                setTimeFrom(input.setTime),
              )
            : newStopFrom(itinerary, input),
        );
        services.stops.addStops(
          itinerary,
          day,
          added,
          stopAfter(itinerary, after),
        );
        const count =
          added.length === 1 ? "1 stop" : `${String(added.length)} stops`;
        return {
          lines: [
            `Added ${count} to ${dayName(itinerary, day)}:`,
            ...added.map(
              (stop) => `- ${stopName({ itinerary, calendar }, stop)}`,
            ),
          ],
          touchedIds: [day.id, ...added.map((stop) => stop.id)],
        };
      }),
  );
}

export function updateStopTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "update_stop",
    UPDATE_STOP_DESCRIPTION,
    UPDATE_STOP_INPUT,
    (input) =>
      itineraryWriteReply(session, (context) => updateStop(input, context)),
  );
}

export function moveStopTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "move_stop",
    MOVE_STOP_DESCRIPTION,
    MOVE_STOP_INPUT,
    ({ stopId, dayId, after, setTime }) =>
      itineraryWriteReply(session, ({ trip, services, calendar }) => {
        const itinerary = trip.itinerary;
        const stop = stopIn(itinerary, stopId);
        const fromDay = calendar.dayOf(itinerary, stop);
        const toDay = dayIn(itinerary, dayId);
        services.stops.moveStop(itinerary, stop, {
          toDay,
          after: stopAfter(itinerary, after),
          setTime: setTimeFrom(setTime),
        });
        return {
          lines: [
            `Moved the stop. It's now ${stopName({ itinerary, calendar }, stop)}.`,
          ],
          touchedIds: [stop.id, fromDay.id, toDay.id],
        };
      }),
  );
}

export function removeStopsTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "remove_stops",
    REMOVE_STOPS_DESCRIPTION,
    REMOVE_STOPS_INPUT,
    ({ stopIds }) =>
      itineraryWriteReply(session, ({ trip, services, calendar }) => {
        if (new Set(stopIds).size !== stopIds.length) {
          throw new RuleError("Give each stop once.");
        }
        const itinerary = trip.itinerary;
        const stops = stopIds.map((id) => stopIn(itinerary, id));
        const days = stops.map((stop) => calendar.dayOf(itinerary, stop));
        const names = stops.map((stop) =>
          stopName({ itinerary, calendar }, stop),
        );
        services.stops.removeStops(itinerary, stops);
        return {
          lines: ["Removed:", ...names.map((name) => `- ${name}`)],
          touchedIds: days.map((day) => day.id),
        };
      }),
  );
}

// In the order tool design 2.1 gives: set time and visit time, then tier, then
// approvals. The approval to remove goes before a new one, so a call can't remove one
// it set.
function updateStop(
  input: UpdateStopInput,
  { trip, services, calendar }: ChangeContext,
): ChangeOutcome {
  const { setTime, visitTimeInMinutes, tier, approveOpeningHours } = input;
  refuseNoChange(
    [
      setTime,
      visitTimeInMinutes,
      tier,
      approveOpeningHours,
      input.removeApproval,
    ],
    "Give at least one change: setTime, visitTimeInMinutes, tier, approveOpeningHours, or removeApproval.",
  );
  const itinerary = trip.itinerary;
  const stop = stopIn(itinerary, input.stopId);
  if (setTime !== undefined) {
    services.stops.setStopTime(itinerary, stop, setTimeFrom(setTime));
  }
  if (visitTimeInMinutes !== undefined) {
    stop.visitTimeInMinutes = visitTimeInMinutes;
  }
  if (tier !== undefined) {
    stop.setTier(tier.tier, tier.tierRule);
  }
  if (input.removeApproval !== undefined) {
    services.stops.removeApproval(stop, input.removeApproval);
  }
  if (approveOpeningHours !== undefined) {
    services.stops.approveOpeningHours(
      itinerary,
      stop,
      approveOpeningHours.reason,
    );
  }
  return {
    lines: [
      `Changed ${stopName({ itinerary, calendar }, stop)}.`,
      ...(approveOpeningHours === undefined ? [] : approvalLines(stop)),
    ],
    touchedIds: [stop.id],
  };
}

// The minutes the approval recorded, which code worked out.
function approvalLines(stop: Stop): string[] {
  return stop.approvals.map(
    (approval) =>
      `Approved its opening hours, with ${durationText(approval.approvedOpenTimeInMinutes)} of the visit open.`,
  );
}

// Code creates the stop with its own rules. Whether it fits the day is
// StopsService.addStops()'s rule (domain model 4.6). A check-in gets its visit time from
// StopsService.newCheckIn().
function newStopFrom(
  itinerary: Itinerary,
  input: Exclude<NewStopInput, { kind: "checkIn" }>,
): Stop {
  const tiering =
    input.kind === "meal"
      ? { tier: input.tier, tierRule: input.tierRule }
      : { tier: null, tierRule: null };
  return newStop({
    kind: input.kind,
    purpose: input.purpose,
    ...searchAreaFrom(itinerary, input.searchArea),
    setTime: setTimeFrom(input.setTime),
    ...tiering,
  });
}

function searchAreaFrom(
  itinerary: Itinerary,
  text: string,
): Pick<Stop, "searchArea" | "searchAreaStay"> {
  const named = NAMED_SEARCH_AREAS.find((area) => area === text);
  if (named !== undefined) {
    return { searchArea: named, searchAreaStay: null };
  }
  if (!text.includes("_")) {
    throw new RuleError(
      `A search area is a stay ID, or ${NAMED_SEARCH_AREA_TEXT}. It was given "${text}".`,
    );
  }
  return { searchArea: "nearStay", searchAreaStay: stayIn(itinerary, text) };
}

// The input schema has checked the text. Null means it follows the stop before it.
function setTimeFrom(text: string): ScheduleTime | null {
  return text === NO_SET_TIME ? null : scheduleTimeFromText(text);
}
