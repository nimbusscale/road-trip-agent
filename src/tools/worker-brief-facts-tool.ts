import type { Candidate } from "../domain/candidate.js";
import { clockText, sentence } from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import { minuteOfScheduleTime } from "../domain/day-timeline.js";
import type { Place } from "../domain/place.js";
import { RuleError } from "../domain/rule-error.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";
import { activityLines } from "./activity-lines.js";
import { dayHeader, stayHeader, stopTimesText } from "./day-lines.js";
import { type ReadContext, readContextOf } from "./read-context.js";
import {
  indented,
  placeLine,
  searchAreaText,
  stopLine,
  stopNumberText,
} from "./stop-lines.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { readReplyOrReadableError, textReply } from "./tool-reply.js";
import { type StopOrStay, stopOrStayIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";
import { READ_WORKER_BRIEF_FACTS_INPUT } from "./worker-input.schema.js";

// The tool a worker reads its worker brief's facts with, so the coordinator doesn't copy
// them into the worker brief (tool design 2.1, and technical spec 5.3). Its lines are
// the read's, so the reply reads like a scoped read_itinerary.

export const READ_WORKER_BRIEF_FACTS_DESCRIPTION = `Reads the facts for the stops and stays in a worker brief. Call it first, with every stop and stay ID the worker brief gives, in one call.

A stay gives its town, with its place ID, its nights and dates, the lodging candidates already offered, and its activities: each attraction stop, with its place and how far the place is from the stay's town, as the crow flies, or its purpose when it has no place yet, and its date and time.

A stop gives its day, with the day's ID and date. Under the day come the stop's kind, purpose, search area, set time or "none", and the candidates already offered. Then every stop on the day, in order, with its times, purpose, and selected place. Stops on the same day come under one day.

Each place shows as its name, place ID, and a short line of facts. A check-in is refused, since no worker fills it.`;

export function readWorkerBriefFactsTool(
  session: TripSession,
): StrictToolDefinition {
  return {
    ...strictTool(
      "read_worker_brief_facts",
      READ_WORKER_BRIEF_FACTS_DESCRIPTION,
      READ_WORKER_BRIEF_FACTS_INPUT,
      ({ stopOrStayIds }) =>
        readReplyOrReadableError(async () => {
          const trip = await session.reader.read(session.tripId);
          const context = readContextOf(trip, session.settings, session.now);
          return textReply(factsLines(context, stopOrStayIds));
        }),
    ),
    annotations: { readOnlyHint: true },
  };
}

// A check-in's place is where the party sleeps that night, so no worker fills it
// (technical spec 6). The candidate tools refuse it the same way.
export function refuseCheckInForWorker(stop: Stop): void {
  if (stop.kind === "checkIn") {
    throw new RuleError(
      `${stop.id} is a check-in. A check-in has no candidates, so no worker fills it.`,
    );
  }
}

// What the reply gives one part for: a stay, or a day with the stops asked for on it.
type Section =
  | { readonly kind: "stay"; readonly stay: Stay }
  | { readonly kind: "day"; readonly day: Day; readonly stops: Stop[] };

// In the order the IDs were given. Stops on one day share that day's section, at the
// place of the first one given, so the day's stops are listed once. An ID given twice
// counts once. A bad ID, or a check-in, refuses the whole call, as in every tool (tool
// design, section 4).
function factsLines(
  context: ReadContext,
  stopOrStayIds: readonly string[],
): string[] {
  const items = [...new Set(stopOrStayIds)].map((id) =>
    stopOrStayIn(context.itinerary, id),
  );
  items.forEach((item) => {
    if (item.kind === "stop") {
      refuseCheckInForWorker(item.stop);
    }
  });
  return sectionsOf(context, items).flatMap((section, index) => [
    ...(index === 0 ? [] : [""]),
    ...(section.kind === "stay"
      ? stayFactsLines(context, section.stay)
      : dayFactsLines(context, section.day, section.stops)),
  ]);
}

function sectionsOf(
  context: ReadContext,
  items: readonly StopOrStay[],
): Section[] {
  const sections: Section[] = [];
  for (const item of items) {
    if (item.kind === "stay") {
      sections.push({ kind: "stay", stay: item.stay });
      continue;
    }
    const day = context.calendar.dayOf(context.itinerary, item.stop);
    const held = sections.find(
      (section) => section.kind === "day" && section.day === day,
    );
    if (held?.kind === "day") {
      held.stops.push(item.stop);
    } else {
      sections.push({ kind: "day", day, stops: [item.stop] });
    }
  }
  return sections;
}

// Such as:
// Stay 1 (stay_…): Moab (place_…), City. 3 nights, Days 1 to 3, from …
// - Lodging candidates already offered:
//   - Set 1: Moab hotel (place_…), selected.
// - The stay's activities:
//   - Fisher Towers viewpoint (place_…): Sunday, October 10, 2027, 10:50 a.m. to …
function stayFactsLines(context: ReadContext, stay: Stay): string[] {
  return [
    stayHeader(context, stay),
    ...offeredLines(
      "Lodging candidates already offered",
      stay.lodgingCandidates,
      stay.lodging,
    ),
    ...activityLines(context.calendar, context.itinerary, stay),
  ];
}

// The day's line, the stops asked for on it in the day's order, then every stop on the
// day, as a whole read gives each one: its times, purpose, and selected place.
function dayFactsLines(
  context: ReadContext,
  day: Day,
  asked: readonly Stop[],
): string[] {
  const inOrder = day.stops.filter((stop) => asked.includes(stop));
  return [
    dayHeader(context, day),
    "Stops asked for:",
    ...inOrder.flatMap((stop) => askedStopLines(context, stop)),
    "The day's stops, in order:",
    ...day.stops.map((stop) =>
      stopLine(context, stop, stopTimesText(context, stop), "slim"),
    ),
  ];
}

// Such as '- Stop 2 (stop_…), meal: "pie". Along the leg. Set time: none.', with the
// candidates already offered under it.
function askedStopLines(context: ReadContext, stop: Stop): string[] {
  return [
    `- ${stopNumberText(context, stop)}. ${searchAreaText(stop)}. ${setTimeText(stop)}`,
    ...indented(
      offeredLines(
        "Candidates already offered",
        stop.candidates,
        stop.selectedPlace,
      ),
    ),
  ];
}

// The read gives no set time when there's none. Here it's always given, so the worker
// knows a stop with none follows the stop before it (tool design 2.1).
function setTimeText(stop: Stop): string {
  return stop.setTime === null
    ? "Set time: none."
    : sentence(`Set time: ${clockText(minuteOfScheduleTime(stop.setTime))}`);
}

// Each candidate's set, counted from 1, and its place, in the order offered (domain
// model section 1). The worker needs only which places were offered, so it gives no
// rationale or times.
function offeredLines(
  label: string,
  candidates: readonly Candidate[],
  selected: Place | null,
): string[] {
  if (candidates.length === 0) {
    return [`- ${label}: none.`];
  }
  return [
    `- ${label}:`,
    ...indented(
      candidates.map(
        (candidate) =>
          `- Set ${String(candidate.setNumber + 1)}: ${placeLine(candidate.place)}${candidate.place.id === selected?.id ? ", selected" : ""}.`,
      ),
    ),
  ];
}
