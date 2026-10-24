import { FeasibilityChecker } from "../domain/feasibility-checker.js";
import type { Itinerary } from "../domain/itinerary.js";
import { RuleError } from "../domain/rule-error.js";
import { calendarAndServicesFor } from "../domain/trip-services.js";
import { ID_PREFIXES } from "../ids/new-id.js";
import {
  dayScopeLines,
  stayScopeLines,
  stopScopeLines,
  wholeLines,
} from "./itinerary-lines.js";
import type { ReadContext } from "./read-context.js";
import {
  READ_ITINERARY_INPUT,
  WHOLE_ITINERARY,
} from "./read-itinerary-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";
import type { TripSession } from "./trip-session.js";

// The tool that reads the itinerary (tool design, section 2.1).

// Claude Code cuts off a tool result over 25,000 tokens, and the coordinator has no
// tool to read the rest (tool design 2.1). The tool can't count tokens without calling
// the API, so it counts characters. A full read of a 14-day trip came to 1.89
// characters a token, as the API counts them for the coordinator's model. So 40,000
// characters is about 21,000 tokens, which leaves room for text with more IDs in it.
export const MAXIMUM_REPLY_CHARACTERS = 40_000;

export const TOO_LARGE_ERROR =
  "Can't read the itinerary: it's too large to return. Read one day, stay, or stop at a time instead.";

export const READ_ITINERARY_DESCRIPTION = `Reads the itinerary: the whole trip, or one day, stay, or stop. Give "${WHOLE_ITINERARY}" for the whole trip. A day gives the day, its leg, its schedule, and its stops with their candidates. A stay gives the stay, its lodging, its days and their stops, and stops on other days whose search area is the stay. A stop gives the stop and every candidate it has had. Every read stays in the conversation, and older reads go out of date, so read only the part a question is about. Each place shows as its name, place ID, and a short line of facts. Candidates are listed in the order offered, with their set. A selected place comes with its rationale. A read of a stay or stop also gives every candidate's rationale, notes, how it was found, and tier. A whole read also lists the places the user rejected. Each read ends with the current feasibility check results for what it covers, each marked new or already known. Schedule times are estimates, from average drive times plus a buffer, and visit times. A whole read of a long trip can be too large to return, and then the reply is an error: read it a stay at a time instead.`;

export function readItineraryTool(session: TripSession): StrictToolDefinition {
  return {
    ...strictTool(
      "read_itinerary",
      READ_ITINERARY_DESCRIPTION,
      READ_ITINERARY_INPUT,
      ({ scope }) =>
        readReplyOrReadableError(async () => {
          const trip = await session.reader.read(session.tripId);
          const { calendar } = calendarAndServicesFor(
            trip,
            session.settings,
            session.now,
          );
          const checker = new FeasibilityChecker({
            tripBrief: trip.tripBrief,
            settings: session.settings,
            calendar,
          });
          const itinerary = trip.itinerary;
          const currentResults = checker.workOut(itinerary);
          const comparison = checker.compare(
            currentResults,
            itinerary.checkResults,
          );
          const lines = linesFor(
            {
              itinerary,
              calendar,
              checker,
              currentResults,
              newResults: new Set(comparison.newResults),
            },
            scope,
          );
          return textReply(withinLimit(lines));
        }),
    ),
    annotations: { readOnlyHint: true },
  };
}

// Scopes are IDs, not a query language, so a bad one gets an error instead of quietly
// returning nothing (tool design 2.1).
function linesFor(context: ReadContext, scope: string): string[] {
  const { itinerary } = context;
  if (scope === WHOLE_ITINERARY) {
    return wholeLines(context);
  }
  if (scope.startsWith(ID_PREFIXES.day)) {
    return dayScopeLines(context, found(itinerary.days, scope, "day"));
  }
  if (scope.startsWith(ID_PREFIXES.stay)) {
    return stayScopeLines(context, found(itinerary.stays, scope, "stay"));
  }
  if (scope.startsWith(ID_PREFIXES.stop)) {
    return stopScopeLines(context, found(stopsOf(itinerary), scope, "stop"));
  }
  throw new RuleError(
    `The scope is "${WHOLE_ITINERARY}", or a day, stay, or stop ID. It was given "${scope}".`,
  );
}

function stopsOf(itinerary: Itinerary) {
  return itinerary.days.flatMap((day) => day.stops);
}

function found<T extends { id: string }>(
  items: readonly T[],
  id: string,
  kind: string,
): T {
  const item = items.find((each) => each.id === id);
  if (item === undefined) {
    throw new RuleError(`This trip has no ${kind} ${id}.`);
  }
  return item;
}

function withinLimit(lines: readonly string[]): string[] {
  const length = lines.reduce((total, line) => total + line.length + 1, 0);
  if (length > MAXIMUM_REPLY_CHARACTERS) {
    throw new RuleError(TOO_LARGE_ERROR);
  }
  return [...lines];
}
