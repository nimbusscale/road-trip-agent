import { durationText, placeText } from "../domain/check-text.js";
import type { CandidateOffer } from "../domain/candidate.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stop } from "../domain/stop.js";
import { CHECK_IN_HAS_NO_CANDIDATES } from "../domain/stop-rules.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { refuseWrongKind } from "./id-kind.js";
import { type ChangeOutcome, itineraryWriteReply } from "./itinerary-write.js";
import { type Positions, stayName, stopName } from "./spot-names.js";
import {
  SELECT_CANDIDATE_INPUT,
  SELECT_USER_PLACE_INPUT,
  type SelectUserPlaceInput,
} from "./stop-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import type { TripSession } from "./trip-session.js";
import { type StopOrStay, stopOrStayIn, stopsOf } from "./trip-items.js";
import { namedPlaceOf } from "./update-itinerary-tool.js";

// The tools that select a stop's place or a stay's lodging: one of its candidates, or a
// place the user named (tool design 2.1).

// The meal visit time is a setting, filled in here, never written into the text (tool
// design, section 4).
export function selectCandidateDescription(mealVisitMinutes: number): string {
  return `Selects one of a stop's candidates, or one of a stay's lodging candidates. Selecting the place already selected changes nothing. Otherwise a stop gets a visit time: an attraction the candidate's, and a meal ${durationText(mealVisitMinutes)}. A place that isn't a candidate there is refused. Select a place the user named with select_user_place.`;
}

export function selectUserPlaceDescription(mealVisitMinutes: number): string {
  return `Selects a place the user named for a stop or a stay's lodging, such as a friend's house or a must-see. It adds the place as a candidate there, in a new set of one, with the user's reason, then selects it. An attraction stop needs visitTimeInMinutes. A meal stop or a stay takes none: a meal gets ${durationText(mealVisitMinutes)}. A place keeps the name Google has for it. The name given is used only for a place Google has no name for, and the reply says when it wasn't used. Refused when the place is already a candidate there, which select_candidate selects, or when the user rejected it. The reply names each other stop and stay where the place is a candidate.`;
}

export function selectCandidateTool(
  session: TripSession,
): StrictToolDefinition {
  return strictTool(
    "select_candidate",
    selectCandidateDescription(session.settings.mealVisitMinutes),
    SELECT_CANDIDATE_INPUT,
    (input) =>
      itineraryWriteReply(session, (context) =>
        selectCandidate(input, context),
      ),
  );
}

export function selectUserPlaceTool(
  session: TripSession,
): StrictToolDefinition {
  return strictTool(
    "select_user_place",
    selectUserPlaceDescription(session.settings.mealVisitMinutes),
    SELECT_USER_PLACE_INPUT,
    (input) =>
      itineraryWriteReply(session, (context) =>
        selectUserPlace(input, context),
      ),
  );
}

// Selecting the place that's already selected changes nothing, so a visit time the
// user changed stays (tool design 2.1).
function selectCandidate(
  { stopOrStayId, placeId }: { stopOrStayId: string; placeId: string },
  { trip, services, calendar, placeOf }: ChangeContext,
): ChangeOutcome {
  const itinerary = trip.itinerary;
  const holder = stopOrStayIn(itinerary, stopOrStayId);
  // A check-in has no candidates, so the reason comes first, not the pointer to
  // select_user_place.
  if (holder.kind === "stop" && holder.stop.kind === "checkIn") {
    throw new RuleError(CHECK_IN_HAS_NO_CANDIDATES);
  }
  refuseWrongKind(placeId, "place");
  const place = placeOf(placeId);
  const where = holderName({ itinerary, calendar }, holder);
  if (!candidatesOf(holder).some((each) => each.id === place.id)) {
    throw new RuleError(
      `${placeText(place)} isn't a candidate for ${where}. To select a place the user named, use select_user_place.`,
    );
  }
  if (selectedOf(holder)?.id === place.id) {
    return {
      lines: [
        `${placeText(place)} was already selected for ${where}, so nothing changed.`,
      ],
      touchedIds: [idOf(holder)],
    };
  }
  if (holder.kind === "stop") {
    services.stops.selectCandidate(holder.stop, place);
  } else {
    holder.stay.selectCandidate(place);
  }
  return {
    lines: [selectedLine(holder, place, where)],
    touchedIds: [idOf(holder)],
  };
}

// Adds the place as a candidate in a set of one, then selects it. There's no "select a
// place the user named" in the domain (domain model 3.5 and 3.7).
function selectUserPlace(
  input: SelectUserPlaceInput,
  { trip, services, calendar, placeOf }: ChangeContext,
): ChangeOutcome {
  const itinerary = trip.itinerary;
  const positions = { itinerary, calendar };
  const holder = stopOrStayIn(itinerary, input.stopOrStayId);
  const nameLines: string[] = [];
  const place = namedPlaceOf(placeOf, input, nameLines);
  const where = holderName(positions, holder);
  refuseRejected(itinerary, place);
  if (candidatesOf(holder).some((each) => each.id === place.id)) {
    throw new RuleError(
      `${placeText(place)} is already a candidate for ${where}. Select it with select_candidate.`,
    );
  }
  const offer = userOffer(place, input.reason);
  if (holder.kind === "stop") {
    const { stop } = holder;
    const visitTimeInMinutes = visitTimeFor(stop, input.visitTimeInMinutes);
    services.stops.addCandidates(itinerary, stop, [
      { ...offer, visitTimeInMinutes },
    ]);
    services.stops.selectCandidate(stop, place);
  } else {
    refuseVisitTimeForStay(input.visitTimeInMinutes);
    services.stays.addLodgingCandidates(itinerary, holder.stay, [offer]);
    holder.stay.selectCandidate(place);
  }
  return {
    lines: [
      selectedLine(holder, place, where),
      ...nameLines,
      ...elsewhereLines(positions, place, idOf(holder)),
    ],
    touchedIds: [idOf(holder)],
  };
}

// A place the user named has no source link, tier, or detour time (domain model 3.9).
function userOffer(place: Place, reason: string): CandidateOffer {
  return {
    place,
    rationale: reason,
    howFound: "specifiedByUser",
    sourceLink: null,
    notesText: null,
    tier: null,
    visitTimeInMinutes: null,
    detourTimeInMinutes: null,
  };
}

// An attraction takes the user's visit time. A meal's is a setting, which
// StopsService.selectCandidate() gives it (tool design 2.1). A check-in takes no place,
// so it's refused first, with the reason, whatever visit time was given.
function visitTimeFor(stop: Stop, given: number | undefined): number | null {
  if (stop.kind === "checkIn") {
    throw new RuleError(CHECK_IN_HAS_NO_CANDIDATES);
  }
  if (stop.kind === "attraction") {
    if (given === undefined) {
      throw new RuleError(
        "An attraction stop needs visitTimeInMinutes: how long the user plans to spend there.",
      );
    }
    return given;
  }
  if (given !== undefined) {
    throw new RuleError(
      "A meal stop takes no visitTimeInMinutes. It gets the usual meal visit time, which update_stop can change once the place is selected.",
    );
  }
  return null;
}

function refuseVisitTimeForStay(given: number | undefined): void {
  if (given !== undefined) {
    throw new RuleError("A stay's lodging takes no visitTimeInMinutes.");
  }
}

// The error gives the user's reason, so the coordinator can tell them (tool design
// 2.1).
function refuseRejected(itinerary: Itinerary, place: Place): void {
  const rejected = itinerary.rejectedPlaces.find(
    (each) => each.place.id === place.id,
  );
  if (rejected !== undefined) {
    throw new RuleError(
      `The user rejected ${placeText(place)} for this trip, because "${rejected.reason}". A rejection can't be taken back.`,
    );
  }
}

// A line for each other stop or stay where the place is a candidate, named as
// find_in_trip names them. The same place can be a candidate on two stops on purpose,
// so the coordinator decides what to do (tool design 2.1).
function elsewhereLines(
  positions: Positions,
  place: Place,
  holderId: string,
): string[] {
  const { itinerary } = positions;
  const name = placeText(place);
  const holds = (candidates: readonly { place: Place }[]): boolean =>
    candidates.some((each) => each.place.id === place.id);
  return [
    ...itinerary.stays
      .filter((stay) => stay.id !== holderId && holds(stay.lodgingCandidates))
      .map(
        (stay) =>
          `${name} is also a lodging candidate for ${stayName(positions, stay)}.`,
      ),
    ...stopsOf(itinerary)
      .filter((stop) => stop.id !== holderId && holds(stop.candidates))
      .map(
        (stop) =>
          `${name} is also a candidate for ${stopName(positions, stop)}.`,
      ),
  ];
}

// Such as "Selected Hangar One for Day 1, Stop 2 (stop_…), attraction: "…", with a
// visit time of 2 h." The visit time is what code worked out for a meal.
function selectedLine(holder: StopOrStay, place: Place, where: string): string {
  if (holder.kind === "stay") {
    return `Selected ${placeText(place)} as the lodging for ${where}.`;
  }
  const visit = holder.stop.visitTimeInMinutes ?? 0;
  return `Selected ${placeText(place)} for ${where}, with a visit time of ${durationText(visit)}.`;
}

function holderName(positions: Positions, holder: StopOrStay): string {
  return holder.kind === "stop"
    ? stopName(positions, holder.stop)
    : `the lodging of ${stayName(positions, holder.stay)}`;
}

function candidatesOf(holder: StopOrStay): Place[] {
  const candidates =
    holder.kind === "stop"
      ? holder.stop.candidates
      : holder.stay.lodgingCandidates;
  return candidates.map((each) => each.place);
}

function selectedOf(holder: StopOrStay): Place | null {
  return holder.kind === "stop"
    ? holder.stop.selectedPlace
    : holder.stay.lodging;
}

function idOf(holder: StopOrStay): string {
  return holder.kind === "stop" ? holder.stop.id : holder.stay.id;
}
