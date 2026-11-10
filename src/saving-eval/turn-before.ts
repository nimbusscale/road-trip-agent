import { withoutAppLines } from "../agent/app-lines.js";
import type { Settings } from "../config/settings.schema.js";
import { Place } from "../domain/place.js";
import { placeRowSchema } from "../persistence/place-row.schema.js";
import { tripFromRow } from "../persistence/plan-document.js";
import { planSchema } from "../persistence/plan.schema.js";
import { wholeLines } from "../tools/itinerary-lines.js";
import { readContextOf } from "../tools/read-context.js";
import { tripBriefLines } from "../tools/trip-brief-tools.js";
import type { RecordedSessionRepository } from "../turn-run/turn-run-repositories.js";
import type {
  VersionMessage,
  VersionRow,
} from "../turn-run/turn-run.schema.js";
import { versionMemoryItemSchema } from "./saving-files.schema.js";

// What a recorded turn started from (#209), for a person reading where its saves went.
// It comes from the turn's trip version in the live database. The trip brief and the
// itinerary are shown as read_trip_brief and a whole read_itinerary would have shown
// them then, on today's code.
export interface TurnBefore {
  sessionTitle: string;
  // The turn's number in its session from 1, and how many turns the session has, as
  // the trip versions count them.
  turn: number;
  turnsInSession: number;
  briefLines: string[];
  itineraryLines: string[];
  memory: { id: string; kind: "user" | "trip"; text: string }[];
}

// The turn to look up: its agent session, its place among the session's
// coordinator.turn spans from 1, and the message the model got, with the app's lines.
export interface RecordedTurnRef {
  agentSessionId: string;
  spanPosition: number;
  message: string;
}

export async function turnBeforeOf(
  live: RecordedSessionRepository,
  settings: Settings,
  ref: RecordedTurnRef,
): Promise<TurnBefore> {
  const session = await live.session(ref.agentSessionId);
  const messages = await live.versionMessages(session.id);
  const turn = versionTurnOf(ref, messages);
  const version = await live.version(session.id, turn);
  return {
    sessionTitle: session.title,
    turn,
    turnsInSession: messages.length,
    ...stateOf(version, settings),
  };
}

// The trip version a turn started from. Phoenix can be missing a turn's trace, such as
// when the tunnel was down, so a span's place in the session can come before its
// version's turn, never after. So it's the first version at or after the span's place
// with the same words. Two turns with the same words, such as "yes", can't both come
// first, since the earlier one's span comes first too.
export function versionTurnOf(
  ref: RecordedTurnRef,
  messages: readonly VersionMessage[],
): number {
  const words = withoutAppLines(ref.message);
  const found = messages.find(
    (version) =>
      version.turn >= ref.spanPosition && version.userMessage === words,
  );
  if (found === undefined) {
    throw new Error(
      `Span ${String(ref.spanPosition)} of ${ref.agentSessionId} has no trip version with its message.`,
    );
  }
  return found.turn;
}

// What's wrong with how a session's turns match its trip versions, from #287's review:
// each turn should match a later version than the turn before it. A failed turn reuses
// its version's number, and two turns with the same words, such as "yes", can match the
// wrong ones when a trace is missing. Then a reading page or a labeler's input shows the
// trip as it stood before a different turn. The messages are the session's
// coordinator.turn spans' messages, in order.
export function versionOrderProblems(
  agentSessionId: string,
  spanMessages: readonly string[],
  versions: readonly VersionMessage[],
): string[] {
  const problems: string[] = [];
  let last: { span: number; turn: number } | null = null;
  for (const [index, message] of spanMessages.entries()) {
    const span = index + 1;
    const turn = matchedTurnOf(
      { agentSessionId, spanPosition: span, message },
      versions,
    );
    if (turn === null) {
      problems.push(`Span ${String(span)} has no trip version with its words.`);
      continue;
    }
    if (last !== null && turn <= last.turn) {
      problems.push(
        `Span ${String(span)} matched version turn ${String(turn)}, but span ${String(last.span)} matched turn ${String(last.turn)}.`,
      );
    }
    last = { span, turn };
  }
  return problems;
}

function matchedTurnOf(
  ref: RecordedTurnRef,
  versions: readonly VersionMessage[],
): number | null {
  try {
    return versionTurnOf(ref, versions);
  } catch {
    return null;
  }
}

// The version's trip is built only to be read, so its ID and owner are never used.
function stateOf(
  version: VersionRow,
  settings: Settings,
): Pick<TurnBefore, "briefLines" | "itineraryLines" | "memory"> {
  const places = version.places.map(
    (row) => new Place(placeRowSchema.parse(row)),
  );
  const trip = tripFromRow(
    {
      id: "recorded",
      ownerId: "recorded",
      plan: planSchema.parse(version.plan),
    },
    places,
  );
  const savedAt = version.savedDateTime;
  return {
    briefLines: tripBriefLines(trip.tripBrief),
    itineraryLines: wholeLines(
      readContextOf(trip, settings, () => savedAt),
      "slim",
    ),
    memory: version.memoryItems.map((item) =>
      versionMemoryItemSchema.parse(item),
    ),
  };
}
