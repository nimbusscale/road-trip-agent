import type {
  ItineraryResponse,
  ShownDay,
  ShownEntry,
  ShownPlace,
  ShownSelection,
  ShownStay,
} from "../../src/shared/itinerary.schema";
import { dayText } from "./dates";
import { countText, timesText } from "./itinerary-text";

// What the itinerary map shows (functional spec 9.2): a marker for each stay, and for
// each attraction and restaurant with a selected place, plus each routed leg's line.
// Places only offered, and not picked, aren't on the map.

export type MarkerKind = "stay" | "attraction" | "restaurant";

// The marker's text is what a click on it shows.
export interface MapMarker {
  key: string;
  kind: MarkerKind;
  place: ShownPlace;
  heading: string;
  details: string[];
  // The selected place, for why it was picked and its source. Null for a stay with no
  // lodging picked yet.
  selection: ShownSelection | null;
}

export interface RouteLine {
  key: string;
  encodedPath: string;
}

export interface Position {
  latitude: number;
  longitude: number;
}

export function mapMarkers(view: ItineraryResponse): MapMarker[] {
  return [
    ...view.stays.map(stayMarker),
    ...view.days.flatMap((day) =>
      day.schedule.flatMap((entry) => stopMarkers(day, entry)),
    ),
  ];
}

export function routeLines(view: ItineraryResponse): RouteLine[] {
  return view.days.flatMap((day) => {
    const line = day.leg?.routeLine ?? null;
    return line === null ? [] : [{ key: day.id, encodedPath: line }];
  });
}

// Where the map zooms to: each marker, and each leg's ends, so a day's drive is in
// view before any place on it is picked.
export function mapPositions(view: ItineraryResponse): Position[] {
  return [
    ...mapMarkers(view).map((marker) => marker.place),
    ...view.days.flatMap((day) =>
      day.leg === null ? [] : [day.leg.from, day.leg.to],
    ),
  ];
}

// At the stay's lodging once one is picked, and in the stay's town until then.
function stayMarker(stay: ShownStay): MapMarker {
  const lodging = stay.lodging.selection;
  const dates =
    stay.arriveDate === null || stay.leaveDate === null
      ? []
      : [`${dayText(stay.arriveDate)} to ${dayText(stay.leaveDate)}`];
  return {
    key: stay.id,
    kind: "stay",
    place: lodging?.place ?? stay.place,
    heading: `Stay ${String(stay.number)}: ${stay.place.name}`,
    details: [
      [countText(stay.nightCount, "night"), ...dates].join(", "),
      lodging === null
        ? "Lodging: not picked yet"
        : `Lodging: ${lodging.place.name}`,
      ...addressLine(lodging?.place ?? null),
    ],
    selection: lodging,
  };
}

function stopMarkers(day: ShownDay, entry: ShownEntry): MapMarker[] {
  const selection = entry.stop?.choice.selection ?? null;
  if (entry.stop === null || selection === null) {
    return [];
  }
  const { stop } = entry;
  const isMeal = stop.kind === "meal";
  return [
    {
      key: stop.id,
      kind: isMeal ? "restaurant" : "attraction",
      place: selection.place,
      heading: selection.place.name,
      details: [
        `Day ${String(day.number)}, ${timesText(entry)}`,
        `${isMeal ? "Meal" : "Attraction"}: ${stop.purpose}`,
        ...addressLine(selection.place),
      ],
      selection,
    },
  ];
}

// A place with no name has its address as its name, so it isn't shown twice.
function addressLine(place: ShownPlace | null): string[] {
  return place === null || place.address === place.name ? [] : [place.address];
}
