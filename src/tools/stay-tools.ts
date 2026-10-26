import { stayText } from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Stay } from "../domain/stay.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { refuseWrongKind } from "./id-kind.js";
import {
  type ChangeOutcome,
  dayName,
  itineraryWriteReply,
  refuseNoChange,
} from "./itinerary-write.js";
import {
  ADD_STAY_INPUT,
  REMOVE_STAY_INPUT,
  UPDATE_STAY_INPUT,
  type UpdateStayInput,
} from "./skeleton-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { FIRST, stayAfter, stayIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";

// The tools that add, change, and remove stays (tool design 2.1).

// A description names the after input, and says what "first" does (tool design 2.1,
// "Where an item goes").
export const ADD_STAY_DESCRIPTION = `Adds a stay, with one day for each of its nights. Give after the ID of the stay it follows, or "${FIRST}" to put it before every other stay. The place is usually a town. The itinerary's start place, end place, and start date must be set before a stay can be added. The reply gives the new stay's ID and its days' IDs, and lists the stops on any day that now starts or ends somewhere else.`;

export const UPDATE_STAY_DESCRIPTION = `Changes a stay: its place, where it goes, its nights, or its lodging tier. Items not given are not changed. To move it, give after the ID of the stay it now follows, or "${FIRST}" to put it before every other stay. Changing the nights adds or removes days at the end of the stay's days. Removing a night is refused while that day holds stops, and the error lists them. The reply gives the IDs of any days added, and lists the stops on any day that now starts or ends somewhere else.`;

export const REMOVE_STAY_DESCRIPTION =
  "Removes a stay and its days. Refused while any stop is on its days, or while a stop on another day has this stay as its search area. The error lists those stops.";

export function addStayTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "add_stay",
    ADD_STAY_DESCRIPTION,
    ADD_STAY_INPUT,
    ({ placeId, after, nightCount, tier, tierRule }) =>
      itineraryWriteReply(session, ({ trip, services, placeOf }) => {
        const itinerary = trip.itinerary;
        refuseWrongKind(placeId, "place");
        const stay = services.stays.addStay(itinerary, {
          place: placeOf(placeId),
          nightCount,
          tier,
          tierRule,
          after: stayAfter(itinerary, after),
        });
        return {
          lines: [
            `Added ${stayText(stay)} (${stay.id}), ${nightsText(itinerary, stay)}`,
          ],
          touchedIds: [stay.id, ...stay.days.map((day) => day.id)],
        };
      }),
  );
}

export function updateStayTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "update_stay",
    UPDATE_STAY_DESCRIPTION,
    UPDATE_STAY_INPUT,
    (input) =>
      itineraryWriteReply(session, (context) => updateStay(input, context)),
  );
}

export function removeStayTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "remove_stay",
    REMOVE_STAY_DESCRIPTION,
    REMOVE_STAY_INPUT,
    ({ stayId }) =>
      itineraryWriteReply(session, ({ trip, services }) => {
        const itinerary = trip.itinerary;
        const stay = stayIn(itinerary, stayId);
        const dayIds = stay.days.map((day) => day.id);
        services.stays.removeStay(itinerary, stay);
        return {
          lines: [
            `Removed ${stayText(stay)} (${stay.id}), and its days: ${dayIds.join(", ")}.`,
          ],
          touchedIds: [stay.id],
        };
      }),
  );
}

// In the order tool design 2.1 gives: place, position, nights, then tier.
function updateStay(
  input: UpdateStayInput,
  { trip, services, placeOf }: ChangeContext,
): ChangeOutcome {
  const { placeId, after, nightCount, tier } = input;
  refuseNoChange(
    [placeId, after, nightCount, tier],
    "Give at least one change: placeId, after, nightCount, or tier.",
  );
  const itinerary = trip.itinerary;
  const stay = stayIn(itinerary, input.stayId);
  const dayIdsBefore = stay.days.map((day) => day.id);
  if (placeId !== undefined) {
    refuseWrongKind(placeId, "place");
    stay.place = placeOf(placeId);
  }
  if (after !== undefined) {
    services.stays.moveStay(itinerary, stay, stayAfter(itinerary, after));
  }
  const added =
    nightCount === undefined
      ? []
      : services.stays.setNightCount(itinerary, stay, nightCount);
  if (tier !== undefined) {
    stay.setTier(tier.tier, tier.tierRule);
  }
  const removed = dayIdsBefore.filter(
    (id) => !stay.days.some((day) => day.id === id),
  );
  return {
    lines: changedStayLines(itinerary, stay, added, removed),
    touchedIds: [stay.id, ...stay.days.map((day) => day.id)],
  };
}

function changedStayLines(
  itinerary: Itinerary,
  stay: Stay,
  added: readonly Day[],
  removedIds: readonly string[],
): string[] {
  return [
    `Changed ${stayText(stay)} (${stay.id}). It has ${nightsText(itinerary, stay)}`,
    ...(added.length === 0
      ? []
      : [
          `Days added: ${added.map((day) => dayName(itinerary, day)).join(", ")}.`,
        ]),
    ...(removedIds.length === 0
      ? []
      : [`Days removed: ${removedIds.join(", ")}.`]),
  ];
}

// Such as "3 nights: Day 2 (day_…), Day 3 (day_…), Day 4 (day_…)."
function nightsText(itinerary: Itinerary, stay: Stay): string {
  const nights =
    stay.nightCount === 1 ? "1 night" : `${String(stay.nightCount)} nights`;
  const days = stay.days.map((day) => dayName(itinerary, day)).join(", ");
  return `${nights}: ${days}.`;
}
