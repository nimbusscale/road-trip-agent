import { placeText } from "../domain/check-text.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import { RejectedPlace } from "../domain/rejected-place.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { refuseWrongKind } from "./id-kind.js";
import { type ChangeOutcome, itineraryWriteReply } from "./itinerary-write.js";
import { type Positions, stayName, stopName } from "./spot-names.js";
import { REJECT_PLACES_INPUT } from "./stop-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import type { TripSession } from "./trip-session.js";

// The tool that rejects places for the whole trip (tool design 2.1, and domain model
// 4.3).

export const REJECT_PLACES_DESCRIPTION =
  "Rejects places for the whole trip, each with the user's reason. Each one is removed from every stop's and stay's candidates. Where it was selected, the selection and the stop's visit time are cleared, and the other candidates stay. A place doesn't have to be a candidate to be rejected. A place already rejected keeps its first reason. A rejection can't be taken back. It leaves a stay's town, the start and end places, and waypoints as they are. The reply lists each stop and stay that lost a candidate.";

export function rejectPlacesTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "reject_places",
    REJECT_PLACES_DESCRIPTION,
    REJECT_PLACES_INPUT,
    ({ rejections }) =>
      itineraryWriteReply(session, (context) =>
        rejectPlaces(rejections, context),
      ),
  );
}

function rejectPlaces(
  rejections: readonly { placeId: string; reason: string }[],
  { trip, services, calendar, placeOf }: ChangeContext,
): ChangeOutcome {
  const ids = rejections.map((each) => each.placeId);
  if (new Set(ids).size !== ids.length) {
    throw new RuleError("Give each place once.");
  }
  const itinerary = trip.itinerary;
  const given = rejections.map(({ placeId, reason }) => {
    refuseWrongKind(placeId, "place");
    return new RejectedPlace({ place: placeOf(placeId), reason });
  });
  const firstLines = given.map((each) => rejectedLine(itinerary, each));
  const places = given.map((each) => each.place);
  const before = heldBefore(itinerary);
  const result = services.rejections.rejectPlaces(itinerary, given);
  const positions = { itinerary, calendar };
  const lost = [
    ...result.stays.map((stay) =>
      lostLine(positions, stay, places, before.get(stay.id)),
    ),
    ...result.stops.map((stop) =>
      lostLine(positions, stop, places, before.get(stop.id)),
    ),
  ];
  return {
    lines: [
      ...firstLines,
      ...(lost.length === 0
        ? [
            `No stop or stay had ${given.length === 1 ? "it" : "any of them"} as a candidate.`,
          ]
        : ["These lost a candidate:", ...lost]),
    ],
    touchedIds: [...result.stays, ...result.stops].map((each) => each.id),
  };
}

// Worked out before the rejection is recorded. One already rejected keeps its first
// reason (domain model 4.3).
function rejectedLine(itinerary: Itinerary, given: RejectedPlace): string {
  const name = placeText(given.place);
  const first = itinerary.rejectedPlaces.find(
    (each) => each.place.id === given.place.id,
  );
  return first === undefined
    ? `Rejected ${name} for the whole trip.`
    : `${name} was already rejected, and keeps its first reason: "${first.reason}".`;
}

// What each stop and stay held before the rejection, by ID: its candidates' place IDs,
// and its selected place's ID.
interface Held {
  readonly candidateIds: ReadonlySet<string>;
  readonly selectedId: string | undefined;
}

function heldBefore(itinerary: Itinerary): Map<string, Held> {
  const held = (
    candidates: readonly { place: Place }[],
    selected: Place | null,
  ): Held => ({
    candidateIds: new Set(candidates.map((each) => each.place.id)),
    selectedId: selected?.id,
  });
  return new Map<string, Held>([
    ...itinerary.stays.map(
      (stay) => [stay.id, held(stay.lodgingCandidates, stay.lodging)] as const,
    ),
    ...itinerary.days
      .flatMap((day) => day.stops)
      .map(
        (stop) => [stop.id, held(stop.candidates, stop.selectedPlace)] as const,
      ),
  ]);
}

// Such as "- Day 2, Stop 4 (stop_…), meal: "burgers": lost Milt's, which was selected,
// so nothing is selected now."
function lostLine(
  positions: Positions,
  holder: Stay | Stop,
  places: readonly Place[],
  held: Held | undefined,
): string {
  const lost = places.filter((place) => held?.candidateIds.has(place.id));
  const where =
    "lodgingCandidates" in holder
      ? `The lodging of ${stayName(positions, holder)}`
      : stopName(positions, holder);
  const cleared = lost.some((place) => place.id === held?.selectedId)
    ? ", which was selected, so nothing is selected now"
    : "";
  return `- ${where}: lost ${lost.map(placeText).join(", ")}${cleared}.`;
}
