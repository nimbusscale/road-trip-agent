import type { Candidate, CandidateOffer } from "../domain/candidate.js";
import { placeText } from "../domain/check-text.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stop } from "../domain/stop.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { refuseWrongKind } from "./id-kind.js";
import { type Positions, stayName, stopName } from "./spot-names.js";
import { addedCandidateLine } from "./stop-lines.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import {
  type ToolReply,
  textReply,
  writeReplyOrReadableError,
} from "./tool-reply.js";
import { stayIn, stopIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";
import { refuseCheckInForWorker } from "./worker-brief-facts-tool.js";
import {
  ADD_LODGING_CANDIDATES_INPUT,
  ADD_STOP_CANDIDATES_INPUT,
  type AddLodgingCandidatesInput,
  type AddStopCandidatesInput,
  type CandidateInput,
} from "./worker-input.schema.js";

// The tools a worker adds candidates with (tool design 2.1). Each call is one set.

const SET_AND_NAME =
  "Add all of its candidates in one call: each call makes a new set, and the user is shown only the newest set. The whole call is refused when any place is already a candidate there, or is one the user rejected. A place keeps the name Google has for it. The name given is used only for a place Google has no name for. The reply names the set, with one line per candidate.";

export const ADD_LODGING_CANDIDATES_DESCRIPTION = `Adds one set of 1 to 3 lodging candidates to a stay, each with its tier. ${SET_AND_NAME}`;

export const ADD_STOP_CANDIDATES_DESCRIPTION = `Adds one set of 1 to 3 candidates to a stop. A meal stop's candidates each take a tier, and an attraction stop's each take visitTimeInMinutes, the estimate of how long a visit takes. For a stop along the leg, the tool works out each candidate's detour time itself, from the day's route as it is now. ${SET_AND_NAME}`;

export function addLodgingCandidatesTool(
  session: TripSession,
): StrictToolDefinition {
  return strictTool(
    "add_lodging_candidates",
    ADD_LODGING_CANDIDATES_DESCRIPTION,
    ADD_LODGING_CANDIDATES_INPUT,
    (input) =>
      workerWriteReply(session, (context) =>
        addLodgingCandidates(input, context),
      ),
  );
}

export function addStopCandidatesTool(
  session: TripSession,
): StrictToolDefinition {
  return strictTool(
    "add_stop_candidates",
    ADD_STOP_CANDIDATES_DESCRIPTION,
    ADD_STOP_CANDIDATES_INPUT,
    (input) =>
      workerWriteReply(session, (context) => addStopCandidates(input, context)),
  );
}

// A worker's write runs no checks, so the reply is only what the change says (tool
// design 2.1, "Writing").
function workerWriteReply(
  session: TripSession,
  change: (context: ChangeContext) => string[] | Promise<string[]>,
): Promise<ToolReply> {
  return writeReplyOrReadableError(async () => {
    const result = await session.writer.write(session.tripId, "worker", change);
    return textReply(result.changeResult);
  });
}

function addLodgingCandidates(
  input: AddLodgingCandidatesInput,
  context: ChangeContext,
): string[] {
  const itinerary = context.trip.itinerary;
  const stay = stayIn(itinerary, input.stayId);
  const positions = { itinerary, calendar: context.calendar };
  const given = withPlaces(context, input.candidates);
  refuseUnfitPlaces(itinerary, {
    where: `the lodging of ${stayName(positions, stay)}`,
    held: stay.lodgingCandidates,
    given,
  });
  const offers = given.map((each) => offerOf(each, null));
  context.services.stays.addLodgingCandidates(itinerary, stay, offers);
  return setLines(
    `Lodging set ${setNumberText(stay.lodgingCandidates)} for ${stayName(positions, stay)}`,
    stay.lodgingCandidates.slice(-offers.length),
  );
}

// The detour times take a call to Google for each place, so the places are checked
// first, and a refused call costs none.
async function addStopCandidates(
  input: AddStopCandidatesInput,
  context: ChangeContext,
): Promise<string[]> {
  const itinerary = context.trip.itinerary;
  const stop = stopIn(itinerary, input.stopId);
  const positions = { itinerary, calendar: context.calendar };
  refuseCheckInForWorker(stop);
  refuseUnfitShapes(positions, stop, input.candidates);
  const given = withPlaces(context, input.candidates);
  refuseUnfitPlaces(itinerary, {
    where: stopName(positions, stop),
    held: stop.candidates,
    given,
  });
  const detours =
    stop.searchArea === "alongLeg"
      ? await context.legs.detourTimesOf(
          itinerary,
          stop,
          given.map((each) => each.place),
        )
      : [];
  const offers = given.map((each, index) =>
    offerOf(each, detours[index] ?? null),
  );
  context.services.stops.addCandidates(itinerary, stop, offers);
  return setLines(
    `Set ${setNumberText(stop.candidates)} for ${stopName(positions, stop)}`,
    stop.candidates.slice(-offers.length),
  );
}

// A candidate as given, with the place its ID names.
interface GivenCandidate {
  readonly candidate: CandidateInput;
  readonly place: Place;
}

// The name given is filled in when Google has none (domain model 3.10). The first name
// given wins, so a later one changes nothing.
function withPlaces(
  { placeOf }: ChangeContext,
  candidates: readonly CandidateInput[],
): GivenCandidate[] {
  return candidates.map((candidate) => {
    refuseWrongKind(candidate.placeId, "place");
    const place = placeOf(candidate.placeId);
    place.fillName(candidate.name);
    return { candidate, place };
  });
}

// A meal's candidates take a tier, and an attraction's a visit time (tool design 2.1).
function refuseUnfitShapes(
  positions: Positions,
  stop: Stop,
  candidates: readonly CandidateInput[],
): void {
  const isAttraction = stop.kind === "attraction";
  if (candidates.every((candidate) => "tier" in candidate !== isAttraction)) {
    return;
  }
  throw new RuleError(
    isAttraction
      ? `${stopName(positions, stop)} is an attraction stop, so each candidate takes visitTimeInMinutes, and no tier.`
      : `${stopName(positions, stop)} is a meal stop, so each candidate takes a tier, and no visitTimeInMinutes.`,
  );
}

// A repeat refuses the whole call, so a set is never partly written (tool design 2.1).
// The domain refuses these too. Here the error names where, and gives the user's reason
// for a rejection.
function refuseUnfitPlaces(
  itinerary: Itinerary,
  given: {
    where: string;
    held: readonly Candidate[];
    given: readonly GivenCandidate[];
  },
): void {
  const { where, held } = given;
  const places = given.given.map((each) => each.place);
  places.forEach((place, index) => {
    const name = placeText(place);
    const rejected = itinerary.rejectedPlaces.find(
      (each) => each.place.id === place.id,
    );
    if (rejected !== undefined) {
      throw new RuleError(
        `The user rejected ${name} for this trip, because "${rejected.reason}".`,
      );
    }
    if (held.some((candidate) => candidate.place.id === place.id)) {
      throw new RuleError(`${name} is already a candidate for ${where}.`);
    }
    if (places.slice(0, index).some((each) => each.id === place.id)) {
      throw new RuleError(`${name} is given more than once.`);
    }
  });
}

// A worker found it, so it has a source link. Notes of "" mean none (domain model 3.9).
function offerOf(
  { candidate, place }: GivenCandidate,
  detourTimeInMinutes: number | null,
): CandidateOffer {
  const notes = candidate.notes.trim();
  return {
    place,
    rationale: candidate.rationale,
    howFound: candidate.howFound,
    sourceLink: candidate.sourceLink,
    notesText: notes === "" ? null : notes,
    tier: "tier" in candidate ? candidate.tier : null,
    visitTimeInMinutes:
      "visitTimeInMinutes" in candidate ? candidate.visitTimeInMinutes : null,
    detourTimeInMinutes,
  };
}

// The newest set's number, counted from 1 (domain model section 1).
function setNumberText(candidates: readonly Candidate[]): string {
  return String((candidates.at(-1)?.setNumber ?? 0) + 1);
}

// Such as 'Set 2 for Day 4, Stop 2 (stop_…), meal: "pie": 3 candidates.', then a line
// for each.
function setLines(set: string, added: readonly Candidate[]): string[] {
  const count =
    added.length === 1 ? "1 candidate" : `${String(added.length)} candidates`;
  return [`${set}: ${count}.`, ...added.map(addedCandidateLine)];
}
