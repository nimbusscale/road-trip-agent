import type { DayApproval, OpeningHoursApproval } from "../domain/approval.js";
import type { CalendarDate } from "../domain/calendar-date.js";
import type { Candidate } from "../domain/candidate.js";
import type { CheckResult } from "../domain/check-result.js";
import type { Day } from "../domain/day.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Leg } from "../domain/leg.js";
import type { Place } from "../domain/place.js";
import type { ScheduleTime } from "../domain/schedule-time.js";
import type { Stay } from "../domain/stay.js";
import type { Stop } from "../domain/stop.js";
import type { WeatherText } from "../domain/weather-text.js";
import type { ItineraryDocument } from "./itinerary-plan.schema.js";

// Turns the itinerary into its part of the plan document: each link as an ID, and each
// time and date as text (persistence design, section 2). itinerary-plan.schema.ts reads
// it back.

type Document<K extends keyof ItineraryDocument> = ItineraryDocument[K];
type StayDocument = Document<"stays">[number];
type DayDocument = Document<"lastDay">;
type StopDocument = DayDocument["stops"][number];

export function itineraryDocumentOf(itinerary: Itinerary): ItineraryDocument {
  return {
    id: itinerary.id,
    startPlaceId: itinerary.startPlace?.id ?? null,
    endPlaceId: itinerary.endPlace?.id ?? null,
    startDate: itinerary.startDate?.toText() ?? null,
    stays: itinerary.stays.map(stayDocumentOf),
    lastDay: dayDocumentOf(itinerary.lastDay),
    rejectedPlaces: itinerary.rejectedPlaces.map((rejected) => ({
      placeId: rejected.place.id,
      reason: rejected.reason,
    })),
    checkResults: itinerary.checkResults.map(checkResultDocumentOf),
  };
}

function stayDocumentOf(stay: Stay): StayDocument {
  return {
    id: stay.id,
    placeId: stay.place.id,
    lodgingId: stay.lodging?.id ?? null,
    lodgingCandidates: stay.lodgingCandidates.map(candidateDocumentOf),
    tier: stay.tier,
    tierRule: stay.tierRule,
    days: stay.days.map((day) => ({
      ...dayDocumentOf(day),
      isRestDay: day.isRestDay,
    })),
    weatherText:
      stay.weatherText === null
        ? null
        : weatherTextDocumentOf(stay.weatherText),
  };
}

function dayDocumentOf(day: Day): DayDocument {
  return {
    id: day.id,
    ownStartTime: day.ownStartTime?.toText() ?? null,
    stops: day.stops.map(stopDocumentOf),
    waypointIds: idsOf(day.waypoints),
    leg: day.leg === null ? null : legDocumentOf(day.leg),
    approvals: day.approvals.map(dayApprovalDocumentOf),
  };
}

function stopDocumentOf(stop: Stop): StopDocument {
  return {
    id: stop.id,
    kind: stop.kind,
    purpose: stop.purpose,
    searchArea: stop.searchArea,
    searchAreaStayId: stop.searchAreaStay?.id ?? null,
    setTime: stop.setTime === null ? null : scheduleTimeText(stop.setTime),
    visitTimeInMinutes: stop.visitTimeInMinutes,
    tier: stop.tier,
    tierRule: stop.tierRule,
    selectedPlaceId: stop.selectedPlace?.id ?? null,
    candidates: stop.candidates.map(candidateDocumentOf),
    approvals: stop.approvals.map(stopApprovalDocumentOf),
  };
}

function legDocumentOf(leg: Leg): DayDocument["leg"] {
  return {
    segmentDriveTimesInMinutes: leg.segmentDriveTimesInMinutes,
    distanceInMiles: leg.distanceInMiles,
    routeLine: leg.routeLine,
    stopIdsInBestOrder: idsOf(leg.stopsInBestOrder),
    timeSavedInMinutes: leg.timeSavedInMinutes,
    routedFromPlaceId: leg.routedFromPlace.id,
    routedToPlaceId: leg.routedToPlace.id,
    routedStopPlaceIds: idsOf(leg.routedStopPlaces),
    routedWaypointIds: idsOf(leg.routedWaypoints),
  };
}

function candidateDocumentOf(
  candidate: Candidate,
): StopDocument["candidates"][number] {
  return {
    placeId: candidate.place.id,
    rationale: candidate.rationale,
    howFound: candidate.howFound,
    sourceLink: candidate.sourceLink,
    notesText: candidate.notesText,
    tier: candidate.tier,
    tierRule: candidate.tierRule,
    visitTimeInMinutes: candidate.visitTimeInMinutes,
    detourTimeInMinutes: candidate.detourTimeInMinutes,
    setNumber: candidate.setNumber,
  };
}

function dayApprovalDocumentOf(
  approval: DayApproval,
): DayDocument["approvals"][number] {
  return approval.kind === "driveHours"
    ? {
        kind: approval.kind,
        reason: approval.reason,
        approvedDrivingInHours: approval.approvedDrivingInHours,
      }
    : {
        kind: approval.kind,
        reason: approval.reason,
        approvedRouteType: approval.approvedRouteType,
      };
}

function stopApprovalDocumentOf(
  approval: OpeningHoursApproval,
): StopDocument["approvals"][number] {
  return {
    kind: approval.kind,
    reason: approval.reason,
    approvedOpenTimeInMinutes: approval.approvedOpenTimeInMinutes,
  };
}

function weatherTextDocumentOf(
  weatherText: WeatherText,
): StayDocument["weatherText"] {
  return {
    guidance: weatherText.guidance,
    label: weatherText.label,
    writtenOnDate: weatherText.writtenOnDate.toText(),
    writtenForPlaceId: weatherText.writtenForPlace.id,
    writtenForDates: weatherText.writtenForDates.map(dateText),
    writtenForActivities: weatherText.writtenForActivities.map((activity) => ({
      stopId: activity.stopId,
      selectedPlaceId: activity.selectedPlace?.id ?? null,
    })),
  };
}

function checkResultDocumentOf(
  checkResult: CheckResult,
): Document<"checkResults">[number] {
  return {
    check: checkResult.check,
    subjectId: checkResult.subjectId,
    text: checkResult.text,
    isApproved: checkResult.isApproved,
    hasUnselectedStopBefore: checkResult.hasUnselectedStopBefore,
  };
}

function scheduleTimeText(
  setTime: ScheduleTime,
): NonNullable<StopDocument["setTime"]> {
  return { time: setTime.time.toText(), isNextDay: setTime.isNextDay };
}

function dateText(date: CalendarDate): string {
  return date.toText();
}

function idsOf(items: readonly (Place | Stop)[]): string[] {
  return items.map((item) => item.id);
}
