import { Candidate, type CandidateFields } from "./candidate.js";
import type { DayFields } from "./day.js";
import { Itinerary, type ItineraryFields } from "./itinerary.js";
import { LastDay } from "./last-day.js";
import { Leg, type LegFields } from "./leg.js";
import type { Place } from "./place.js";
import { RejectedPlace } from "./rejected-place.js";
import { Stay, type StayFields } from "./stay.js";
import { StayDay, type StayDayFields } from "./stay-day.js";
import { Stop, type StopFields } from "./stop.js";
import { VIA_SERVICE } from "./via-service.js";
import {
  ActivityRecord,
  WeatherText,
  type WeatherTextFields,
} from "./weather-text.js";

// The itinerary as it's stored, with each link as an ID (persistence design, section 2).
// itineraryFromStored() turns the IDs back into links. It's here, not in persistence,
// because the links run in a loop: a stay holds its days, a day holds its stops, and a
// stop can link to any stay, including the one that holds it. So no order of
// constructors works, and the stops and legs are added to the days afterwards with
// the days' change methods, which only src/domain/ reaches.

export type StoredCandidate = Omit<CandidateFields, "place"> & {
  placeId: string;
};

export type StoredStop = Omit<
  StopFields,
  "searchAreaStay" | "selectedPlace" | "candidates"
> & {
  searchAreaStayId: string | null;
  selectedPlaceId: string | null;
  candidates: readonly StoredCandidate[];
};

export type StoredLeg = Omit<
  LegFields,
  | "stopsInBestOrder"
  | "routedFromPlace"
  | "routedToPlace"
  | "routedStopPlaces"
  | "routedWaypoints"
> & {
  stopIdsInBestOrder: readonly string[];
  routedFromPlaceId: string;
  routedToPlaceId: string;
  routedStopPlaceIds: readonly string[];
  routedWaypointIds: readonly string[];
};

export type StoredDay = DayFields & {
  stops: readonly StoredStop[];
  waypointIds: readonly string[];
  leg: StoredLeg | null;
};

export type StoredStayDay = StoredDay & Pick<StayDayFields, "isRestDay">;

export type StoredWeatherText = Omit<
  WeatherTextFields,
  "writtenForPlace" | "writtenForActivities"
> & {
  writtenForPlaceId: string;
  writtenForActivities: readonly {
    stopId: string;
    selectedPlaceId: string | null;
  }[];
};

export type StoredStay = Omit<
  StayFields,
  "place" | "lodging" | "lodgingCandidates" | "days" | "weatherText"
> & {
  placeId: string;
  lodgingId: string | null;
  lodgingCandidates: readonly StoredCandidate[];
  days: readonly StoredStayDay[];
  weatherText: StoredWeatherText | null;
};

export type StoredItinerary = Omit<
  ItineraryFields,
  "startPlace" | "endPlace" | "stays" | "lastDay" | "rejectedPlaces"
> & {
  startPlaceId: string | null;
  endPlaceId: string | null;
  stays: readonly StoredStay[];
  lastDay: StoredDay;
  rejectedPlaces: readonly { placeId: string; reason: string }[];
};

export type PlaceOf = (placeId: string) => Place;

// Builds the itinerary from its stored form. Each object runs its own rules as it's
// built, so a stored value that breaks one fails the load.
export function itineraryFromStored(
  stored: StoredItinerary,
  placeOf: PlaceOf,
): Itinerary {
  const stays = stored.stays.map((stay) => stayFromStored(stay, placeOf));
  const lastDay = new LastDay(stored.lastDay);
  const storedDays = [
    ...stored.stays.flatMap((stay) => stay.days),
    stored.lastDay,
  ];
  const days = [...stays.flatMap((stay) => stay.days), lastDay];
  const stayOf = byId(stays, "stay");
  const stopsByDay = storedDays.map((storedDay) =>
    storedDay.stops.map((stop) => stopFromStored(stop, placeOf, stayOf)),
  );
  const stopOf = byId(stopsByDay.flat(), "stop");
  days.forEach((day, index) => {
    const storedDay = storedDays[index];
    day[VIA_SERVICE].placeStops(stopsByDay[index] ?? [], null);
    if (storedDay?.leg) {
      day[VIA_SERVICE].setLeg(legFromStored(storedDay.leg, placeOf, stopOf));
    }
    if (storedDay !== undefined && storedDay.waypointIds.length > 0) {
      day.setWaypoints(storedDay.waypointIds.map(placeOf));
    }
  });
  return new Itinerary({
    ...stored,
    startPlace: placeOrNull(stored.startPlaceId, placeOf),
    endPlace: placeOrNull(stored.endPlaceId, placeOf),
    stays,
    lastDay,
    rejectedPlaces: stored.rejectedPlaces.map(
      (rejected) =>
        new RejectedPlace({
          place: placeOf(rejected.placeId),
          reason: rejected.reason,
        }),
    ),
  });
}

function stayFromStored(stored: StoredStay, placeOf: PlaceOf): Stay {
  return new Stay({
    ...stored,
    place: placeOf(stored.placeId),
    lodging: placeOrNull(stored.lodgingId, placeOf),
    lodgingCandidates: stored.lodgingCandidates.map((candidate) =>
      candidateFromStored(candidate, placeOf),
    ),
    // Their stops and legs come once every stay exists.
    days: stored.days.map((day) => new StayDay(day)),
    weatherText:
      stored.weatherText === null
        ? null
        : weatherTextFromStored(stored.weatherText, placeOf),
  });
}

function stopFromStored(
  stored: StoredStop,
  placeOf: PlaceOf,
  stayOf: (stayId: string) => Stay,
): Stop {
  return new Stop({
    ...stored,
    searchAreaStay:
      stored.searchAreaStayId === null ? null : stayOf(stored.searchAreaStayId),
    selectedPlace: placeOrNull(stored.selectedPlaceId, placeOf),
    candidates: stored.candidates.map((candidate) =>
      candidateFromStored(candidate, placeOf),
    ),
  });
}

function legFromStored(
  stored: StoredLeg,
  placeOf: PlaceOf,
  stopOf: (stopId: string) => Stop,
): Leg {
  return new Leg({
    ...stored,
    stopsInBestOrder: stored.stopIdsInBestOrder.map(stopOf),
    routedFromPlace: placeOf(stored.routedFromPlaceId),
    routedToPlace: placeOf(stored.routedToPlaceId),
    routedStopPlaces: stored.routedStopPlaceIds.map(placeOf),
    routedWaypoints: stored.routedWaypointIds.map(placeOf),
  });
}

function weatherTextFromStored(
  stored: StoredWeatherText,
  placeOf: PlaceOf,
): WeatherText {
  return new WeatherText({
    ...stored,
    writtenForPlace: placeOf(stored.writtenForPlaceId),
    writtenForActivities: stored.writtenForActivities.map(
      (activity) =>
        new ActivityRecord({
          stopId: activity.stopId,
          selectedPlace: placeOrNull(activity.selectedPlaceId, placeOf),
        }),
    ),
  });
}

function candidateFromStored(
  stored: StoredCandidate,
  placeOf: PlaceOf,
): Candidate {
  return new Candidate({ ...stored, place: placeOf(stored.placeId) });
}

function placeOrNull(placeId: string | null, placeOf: PlaceOf): Place | null {
  return placeId === null ? null : placeOf(placeId);
}

// A link to an object the plan doesn't hold means the stored plan is broken.
function byId<T extends { id: string }>(
  items: readonly T[],
  what: string,
): (id: string) => T {
  const map = new Map(items.map((item) => [item.id, item]));
  return (id) => {
    const item = map.get(id);
    if (item === undefined) {
      throw new Error(
        `The stored plan links to a ${what} it doesn't hold: ${id}.`,
      );
    }
    return item;
  };
}
