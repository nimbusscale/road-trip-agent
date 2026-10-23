import type { Approval } from "../domain/approval.js";
import type { Candidate } from "../domain/candidate.js";
import {
  clockText,
  durationText,
  placeText,
  sentence,
} from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import { minuteOfScheduleTime } from "../domain/day-timeline.js";
import type { Place } from "../domain/place.js";
import type { Stop } from "../domain/stop.js";
import type { ReadContext } from "./read-context.js";

// How read_itinerary shows a stop, its candidates, and approvals (tool design 2.1). Each
// place is its name, ID, and short line, never its full record (technical spec 7.2).

// Short: each candidate's set, place, and times, with the selected one's rationale, for
// a whole read or a day. Full: every stored property of every candidate, for a read
// scoped to a stay or a stop.
export type Detail = "short" | "full";

const SEARCH_AREA_TEXT = {
  alongLeg: "Along the leg",
  nearStartPlace: "Near the start place",
  nearEndPlace: "Near the end place",
} as const;

const HOW_FOUND_TEXT = {
  google: "Found on Google",
  webSearch: "Found by web search",
} as const;

// Such as "Milt's Stop & Eat (place_…), Hamburger restaurant, 4.6 stars, $, Moab".
export function placeLine(place: Place): string {
  const shortLine = place.shortLine;
  const named = `${placeText(place)} (${place.id})`;
  return shortLine === "" ? named : `${named}, ${shortLine}`;
}

// The stop's line, then its candidates and approvals, indented under it. `times` is
// its arrival and end from the day's schedule, such as "12:00 p.m. to 12:45 p.m.".
export function stopLines(
  context: ReadContext,
  stop: Stop,
  times: string,
  detail: Detail,
): string[] {
  const order = context.calendar.orderOf(context.itinerary, stop);
  return [
    `- ${times}: Stop ${String(order + 1)} (${stop.id}), ${stop.kind}: "${stop.purpose}". ${stopFacts(stop)}`,
    ...indented(
      candidateLines(stop.candidates, stop.selectedPlace, detail, "Candidates"),
    ),
    ...indented(
      stop.approvals.map((approval) => approvalLine(context, stop, approval)),
    ),
  ];
}

function stopFacts(stop: Stop): string {
  const area =
    stop.searchArea === "nearStay"
      ? `Near the ${stop.searchAreaStay === null ? "" : placeText(stop.searchAreaStay.place)} stay`
      : SEARCH_AREA_TEXT[stop.searchArea];
  const facts = [`${area}.`];
  if (stop.setTime !== null) {
    facts.push(
      sentence(`Set time: ${clockText(minuteOfScheduleTime(stop.setTime))}`),
    );
  }
  if (stop.tier !== null && stop.tierRule !== null) {
    facts.push(`Tier: ${stop.tier}, from the rule "${stop.tierRule}".`);
  }
  const place = stop.selectedPlace;
  if (place !== null && stop.visitTimeInMinutes !== null) {
    facts.push(
      `Selected: ${placeText(place)} (${place.id}), visit time ${durationText(stop.visitTimeInMinutes)}.`,
    );
  } else {
    facts.push(
      stop.status === "empty" ? "No candidates yet." : "No place selected yet.",
    );
  }
  return facts.join(" ");
}

// In the order offered, each with its set, counted from 1 as people count (domain model
// section 1). Empty when there are none: the stop's or stay's line says so.
export function candidateLines(
  candidates: readonly Candidate[],
  selected: Place | null,
  detail: Detail,
  label: string,
): string[] {
  if (candidates.length === 0) {
    return [];
  }
  return [
    `- ${label}:`,
    ...indented(
      candidates.map(
        (candidate) =>
          `- ${candidateText(candidate, candidate.place.id === selected?.id, detail)}`,
      ),
    ),
  ];
}

function candidateText(
  candidate: Candidate,
  isSelected: boolean,
  detail: Detail,
): string {
  const parts = [
    `Set ${String(candidate.setNumber + 1)}: ${placeLine(candidate.place)}`,
  ];
  if (candidate.visitTimeInMinutes !== null) {
    parts.push(`visit time ${durationText(candidate.visitTimeInMinutes)}`);
  }
  if (candidate.detourTimeInMinutes !== null) {
    parts.push(
      `detour ${durationText(candidate.detourTimeInMinutes)} when offered`,
    );
  }
  if (isSelected) {
    parts.push("selected");
  }
  const text = `${parts.join(", ")}.`;
  if (detail === "full") {
    return `${text} ${fullFacts(candidate)}`;
  }
  return isSelected ? `${text} Why: "${candidate.rationale}"` : text;
}

// Every other stored property: the rationale, the tier it was offered at, how it was
// found, and the notes.
function fullFacts(candidate: Candidate): string {
  const facts = [`Why: "${candidate.rationale}"`];
  if (candidate.tier !== null && candidate.tierRule !== null) {
    facts.push(
      `Offered at tier ${candidate.tier}, from the rule "${candidate.tierRule}".`,
    );
  }
  facts.push(
    candidate.howFound === "specifiedByUser"
      ? "Named by the user."
      : `${HOW_FOUND_TEXT[candidate.howFound]}: ${candidate.sourceLink ?? ""}`,
  );
  if (candidate.notesText !== null) {
    facts.push(`Notes: "${candidate.notesText}"`);
  }
  return facts.join(" ");
}

// Each approval with the user's reason, marked as applying or not (domain model 4.8).
export function approvalLine(
  context: ReadContext,
  holder: Day | Stop,
  approval: Approval,
): string {
  const applies = context.checker.isApplying(
    context.itinerary,
    holder,
    approval.kind,
  )
    ? "It applies."
    : "It no longer applies.";
  return `- Approval: ${approvalText(approval)}, because "${approval.reason}". ${applies}`;
}

function approvalText(approval: Approval): string {
  switch (approval.kind) {
    case "driveHours":
      return `drive hours, up to ${String(approval.approvedDrivingInHours)} hours of driving`;
    case "routeType":
      return `route type ${approval.approvedRouteType}`;
    case "openingHours":
      return `opening hours, with ${durationText(approval.approvedOpenTimeInMinutes)} of the visit open`;
  }
}

export function indented(lines: readonly string[]): string[] {
  return lines.map((line) => `  ${line}`);
}
