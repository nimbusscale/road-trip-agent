import type { Calendar } from "../domain/calendar.js";
import type { Candidate } from "../domain/candidate.js";
import { clockText, durationText, placeText } from "../domain/check-text.js";
import type { Day } from "../domain/day.js";
import { minuteOfScheduleTime } from "../domain/day-timeline.js";
import type { Itinerary } from "../domain/itinerary.js";
import type { Place } from "../domain/place.js";
import type { ScheduleEntry } from "../domain/schedule-entry.js";
import type { ScheduleTime } from "../domain/schedule-time.js";
import type { Stay } from "../domain/stay.js";
import { StayDay } from "../domain/stay-day.js";
import type { Stop } from "../domain/stop.js";
import type { Tier } from "../domain/tier.js";
import type { Trip } from "../domain/trip.js";
import type {
  ItineraryResponse,
  ShownChoice,
  ShownDay,
  ShownEntry,
  ShownLeg,
  ShownOption,
  ShownOptionCard,
  ShownPlace,
  ShownStay,
  ShownStop,
  ShownSummary,
  ShownWeather,
} from "../shared/itinerary.schema.js";
import { clockTextOf } from "../tools/clock-time.js";

// The itinerary as the view beside the chat shows it (functional spec 9). Stays, days,
// and stops are counted from 1, as people count them (domain model section 1).

export function itineraryViewOf(
  trip: Trip,
  calendar: Calendar,
): ItineraryResponse {
  const { itinerary } = trip;
  return {
    summary: summaryOf(trip),
    stays: itinerary.stays.map((stay, index) =>
      stayOf(itinerary, calendar, stay, index),
    ),
    days: itinerary.days.map((day, index) =>
      dayOf(itinerary, calendar, day, index),
    ),
  };
}

function summaryOf(trip: Trip): ShownSummary {
  const { itinerary } = trip;
  return {
    name: trip.name,
    startDate: itinerary.startDate?.toText() ?? null,
    endDate: itinerary.endDate?.toText() ?? null,
    startPlace: placeOrNull(itinerary.startPlace),
    endPlace: placeOrNull(itinerary.endPlace),
    totalDriveTime: durationText(itinerary.totalDriveTimeInMinutes),
    dayCount: itinerary.dayCount,
    stayCount: itinerary.stays.length,
  };
}

function stayOf(
  itinerary: Itinerary,
  calendar: Calendar,
  stay: Stay,
  index: number,
): ShownStay {
  const dates = calendar.datesOf(itinerary, stay);
  return {
    id: stay.id,
    number: index + 1,
    place: shownPlaceOf(stay.place),
    nightCount: stay.nightCount,
    arriveDate: dates[0]?.toText() ?? null,
    leaveDate: dates.at(-1)?.toText() ?? null,
    lodging: choiceOf(stay.lodging, stay.lodgingCandidates, true),
    weather: weatherOf(itinerary, calendar, stay),
  };
}

function weatherOf(
  itinerary: Itinerary,
  calendar: Calendar,
  stay: Stay,
): ShownWeather | null {
  const text = stay.weatherText;
  if (text === null) {
    return null;
  }
  return {
    guidance: text.guidance,
    label: text.label,
    writtenOnDate: text.writtenOnDate.toText(),
    isOutOfDate: calendar.isWeatherOutOfDate(itinerary, stay),
  };
}

function dayOf(
  itinerary: Itinerary,
  calendar: Calendar,
  day: Day,
  index: number,
): ShownDay {
  const schedule = calendar.scheduleOf(itinerary, day);
  return {
    id: day.id,
    number: index + 1,
    date: calendar.dateOf(itinerary, day)?.toText() ?? null,
    location: calendar.locationOf(itinerary, day),
    startTime: clockTextOf(calendar.startTimeOf(itinerary, day)),
    isRestDay: day instanceof StayDay && day.isRestDay,
    isLastDay: day.kind === "lastDay",
    leg: legOf(itinerary, calendar, day),
    schedule: schedule.map((entry) => entryOf(itinerary, calendar, entry)),
    arrival: arrivalOf(itinerary, calendar, day, schedule.at(-1)),
  };
}

// Only a day that drives has a leg, so a rest day has none (domain model 4.7, "Which
// days have a leg").
function legOf(
  itinerary: Itinerary,
  calendar: Calendar,
  day: Day,
): ShownLeg | null {
  const from = calendar.fromPlaceOf(itinerary, day);
  const to = calendar.toPlaceOf(itinerary, day);
  if (from === null || to === null || !calendar.hasLeg(itinerary, day)) {
    return null;
  }
  const leg = day.leg;
  return {
    from: shownPlaceOf(from),
    to: shownPlaceOf(to),
    driveTime: leg === null ? null : durationText(leg.driveTimeInMinutes),
    distanceInMiles: leg?.distanceInMiles ?? null,
    routeLine: leg?.routeLine ?? null,
    stopsAlongTheWay: day.stops.flatMap((stop) =>
      stop.searchArea === "alongLeg" && stop.selectedPlace !== null
        ? [placeText(stop.selectedPlace)]
        : [],
    ),
    routeType: routeTypeOf(day),
  };
}

// Shown only when the day holds a route type approval, with the user's reason. Other
// legs follow the trip's preference and show no label (technical spec section 8).
function routeTypeOf(day: Day): ShownLeg["routeType"] {
  const approval = day.approvals.find((each) => each.kind === "routeType");
  return approval === undefined
    ? null
    : { routeType: approval.approvedRouteType, reason: approval.reason };
}

function entryOf(
  itinerary: Itinerary,
  calendar: Calendar,
  entry: ScheduleEntry,
): ShownEntry {
  const { startTime, endTime } = entry;
  const minutes =
    startTime === null || endTime === null
      ? null
      : minuteOfScheduleTime(endTime) - minuteOfScheduleTime(startTime);
  return {
    kind: entry.kind,
    startTime: timeText(startTime),
    endTime: timeText(endTime),
    duration:
      entry.kind === "stop" || minutes === null ? null : durationText(minutes),
    stop: entry.stop === null ? null : stopOf(itinerary, calendar, entry.stop),
  };
}

function stopOf(
  itinerary: Itinerary,
  calendar: Calendar,
  stop: Stop,
): ShownStop {
  return {
    id: stop.id,
    number: calendar.orderOf(itinerary, stop) + 1,
    kind: stop.kind,
    purpose: stop.purpose,
    setTime: timeText(stop.setTime),
    choice: choiceOf(stop.selectedPlace, stop.candidates, stop.kind === "meal"),
    checkInPlace:
      stop.kind === "checkIn"
        ? placeOrNull(calendar.placeOf(itinerary, stop))
        : null,
  };
}

// The arrival after the last drive. None when the day ends without one, such as a rest
// day.
function arrivalOf(
  itinerary: Itinerary,
  calendar: Calendar,
  day: Day,
  last: ScheduleEntry | undefined,
): ShownDay["arrival"] {
  const to = calendar.toPlaceOf(itinerary, day);
  if (last?.kind !== "drive" || to === null) {
    return null;
  }
  return { place: shownPlaceOf(to), time: timeText(last.endTime) };
}

// The selected place keeps the rationale of the candidate it was picked from
// (functional spec 7.6). Lodging and meals have tiers, and attractions don't
// (functional spec 7.1).
function choiceOf(
  selected: Place | null,
  candidates: readonly Candidate[],
  hasTiers: boolean,
): ShownChoice {
  const picked =
    selected === null
      ? undefined
      : candidates.find((candidate) => candidate.place.id === selected.id);
  if (selected === null || picked === undefined) {
    return {
      status: candidates.length === 0 ? "empty" : "proposed",
      candidateCount: candidates.length,
      selection: null,
      card: candidates.length === 0 ? null : optionCardOf(candidates, hasTiers),
    };
  }
  return {
    status: "selected",
    candidateCount: candidates.length,
    selection: {
      place: shownPlaceOf(selected),
      rationale: picked.rationale,
      namedByUser: !picked.isFoundByWorker,
      sourceLink: picked.sourceLink,
    },
    card: null,
  };
}

function shownPlaceOf(place: Place): ShownPlace {
  return {
    id: place.id,
    name: placeText(place),
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

function placeOrNull(place: Place | null): ShownPlace | null {
  return place === null ? null : shownPlaceOf(place);
}

function timeText(time: ScheduleTime | null): string | null {
  return time === null ? null : clockText(minuteOfScheduleTime(time));
}

// The newest set: the highest set number still there (domain model 3.9).
function optionCardOf(
  candidates: readonly Candidate[],
  hasTiers: boolean,
): ShownOptionCard {
  const newest = Math.max(...candidates.map((each) => each.setNumber));
  const set = candidates.filter((each) => each.setNumber === newest);
  const everyTier = (tier: Tier) => set.every((each) => each.tier === tier);
  return {
    options: set.map((candidate) => optionOf(candidate, hasTiers)),
    higherTier: hasTiers && !everyTier("upscale"),
    lowerTier: hasTiers && !everyTier("value"),
  };
}

const TIER_TEXT: Record<Tier, string> = {
  value: "Value",
  midRange: "Mid-range",
  upscale: "Upscale",
};

function optionOf(candidate: Candidate, hasTiers: boolean): ShownOption {
  const { place, visitTimeInMinutes, detourTimeInMinutes } = candidate;
  const namedByUser = !candidate.isFoundByWorker;
  return {
    place: shownPlaceOf(place),
    type: place.type,
    location: place.town ?? place.address,
    rating: ratingText(place),
    tier: tierText(candidate, hasTiers),
    namedByUser,
    rationale: candidate.rationale,
    notes: candidate.notesText,
    sourceLink: candidate.sourceLink,
    visitTime:
      visitTimeInMinutes === null ? null : durationText(visitTimeInMinutes),
    detourTime:
      detourTimeInMinutes === null ? null : durationText(detourTimeInMinutes),
  };
}

// A place the user named has no tier, and shows "Your choice" in its place
// (functional spec 7.1).
function tierText(candidate: Candidate, hasTiers: boolean): string | null {
  if (candidate.tier !== null) {
    return TIER_TEXT[candidate.tier];
  }
  return hasTiers && !candidate.isFoundByWorker ? "Your choice" : null;
}

// Such as "4.5 stars, 1,234 reviews". Every place shows Google's rating when it has
// one, attractions included (functional spec 7.5).
function ratingText({ rating, reviewCount }: Place): string | null {
  if (rating === null) {
    return null;
  }
  const stars = `${rating.toFixed(1)} stars`;
  if (reviewCount === null) {
    return stars;
  }
  const reviews = reviewCount === 1 ? "review" : "reviews";
  return `${stars}, ${reviewCount.toLocaleString("en-US")} ${reviews}`;
}
