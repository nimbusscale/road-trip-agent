import { RuleError } from "../domain/rule-error.js";
import { ID_PREFIXES } from "../ids/new-id.js";
import {
  dayScopeLines,
  stayScopeLines,
  stopScopeLines,
  wholeLines,
} from "./itinerary-lines.js";
import { type ReadContext, readContextOf } from "./read-context.js";
import {
  READ_ITINERARY_INPUT,
  WHOLE_ITINERARY,
} from "./read-itinerary-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { dayIn, stayIn, stopIn } from "./trip-items.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";
import type { TripSession } from "./trip-session.js";

// The tool that reads the itinerary (tool design, section 2.1).

// Claude Code cuts off a tool result over 25,000 tokens, and the coordinator has no
// tool to read the rest (tool design 2.1). The tool can't count tokens without calling
// the API, so it counts characters. Measured on 2026-10-26, reads of a 14-day trip ran
// from 1.80 to 2.13 characters a token, as the API counts them for the coordinator's
// model. At 1.80, 40,000 characters is about 22,200 tokens, still under 25,000. That
// trip's whole read, with nearly everything picked, was 27,582 characters.
export const MAXIMUM_REPLY_CHARACTERS = 40_000;

// A whole read has no fallback: no scoped read shows what only the whole read does,
// such as the check results about the trip's length (tool design 2.1).
export const WHOLE_TOO_LARGE_ERROR =
  "Can't read the itinerary: it's too large to read, so this trip can't be planned any further.";

export const SCOPED_TOO_LARGE_ERROR =
  "Can't read the itinerary: it's too large to return. Read one day, stay, or stop at a time instead.";

export const READ_ITINERARY_DESCRIPTION = `Reads the itinerary: the whole trip, or one day, stay, or stop. Give "${WHOLE_ITINERARY}" for the whole trip. Every read stays in the conversation, and older reads go out of date, so read only the part a question is about. Each place shows as its name, place ID, and a short line of facts, except where a whole read gives less.

A day gives the day, its leg, its schedule, and its stops with their candidates. A stay gives the stay, its lodging and every lodging candidate, its weather and clothing text, its days and their stops, and stops on other days whose search area is the stay. A stop gives the stop and every candidate it has had. These reads list candidates in the order offered, with their set. A selected place comes with its rationale. A read of a stay or stop also gives every candidate's rationale, notes, how it was found, and tier.

The whole trip gives its start and end places, its dates, each stay and day with its leg, schedule, and stops, and the places the user rejected. It lists no candidates. Each selected place shows on its stop's or lodging line, as its name, place ID, and town. The other candidates are only counted by set, such as "Other candidates: 2 in set 1." It leaves out every rationale, each stay's weather and clothing text, and each candidate's tier.

Each read ends with the current feasibility check results for what it covers, each marked new or already known.`;

export function readItineraryTool(session: TripSession): StrictToolDefinition {
  return {
    ...strictTool(
      "read_itinerary",
      READ_ITINERARY_DESCRIPTION,
      READ_ITINERARY_INPUT,
      ({ scope }) =>
        readReplyOrReadableError(async () => {
          const trip = await session.reader.read(session.tripId);
          const context = readContextOf(trip, session.settings, session.now);
          const lines = linesFor(context, scope);
          return textReply(withinLimit(lines, scope));
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
    return wholeLines(context, "slim");
  }
  if (scope.startsWith(ID_PREFIXES.day)) {
    return dayScopeLines(context, dayIn(itinerary, scope));
  }
  if (scope.startsWith(ID_PREFIXES.stay)) {
    return stayScopeLines(context, stayIn(itinerary, scope));
  }
  if (scope.startsWith(ID_PREFIXES.stop)) {
    return stopScopeLines(context, stopIn(itinerary, scope));
  }
  throw new RuleError(
    `The scope is "${WHOLE_ITINERARY}", or a day, stay, or stop ID. It was given "${scope}".`,
  );
}

function withinLimit(lines: readonly string[], scope: string): string[] {
  const length = lines.reduce((total, line) => total + line.length + 1, 0);
  if (length > MAXIMUM_REPLY_CHARACTERS) {
    throw new RuleError(
      scope === WHOLE_ITINERARY
        ? WHOLE_TOO_LARGE_ERROR
        : SCOPED_TOO_LARGE_ERROR,
    );
  }
  return [...lines];
}
