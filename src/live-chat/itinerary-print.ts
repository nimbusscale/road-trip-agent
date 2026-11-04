import { dayText, tripDatesText } from "../shared/dates.js";
import type {
  ItineraryResponse,
  ShownChoice,
  ShownDay,
  ShownEntry,
  ShownLeg,
  ShownStay,
  ShownSummary,
  ShownWeather,
} from "../shared/itinerary.schema.js";
import {
  countText,
  STOP_KIND_TEXT,
  timesText,
} from "../shared/itinerary-text.js";
import type { OpenCard } from "./option-cards.js";

// The itinerary as the itinerary view shows it (functional spec 9), as text: the trip
// summary, the stays, and each day with its leg and schedule. There's no map. An open
// option card shows only its number, since the cards action prints the cards.
export function itineraryText(
  view: ItineraryResponse,
  cards: readonly OpenCard[],
): string {
  const cardNumber = (holderId: string): number =>
    cards.findIndex((each) => each.holder.id === holderId) + 1;
  const stays =
    view.stays.length === 0
      ? ["No stays yet."]
      : view.stays.flatMap((stay) => stayLines(stay, cardNumber));
  return [
    ...summaryLines(view.summary),
    "",
    "Stays",
    ...stays,
    "",
    "Days",
    ...view.days.flatMap((day) => ["", ...dayLines(day, cardNumber)]),
  ].join("\n");
}

type CardNumber = (holderId: string) => number;

function summaryLines(summary: ShownSummary): string[] {
  const { startPlace, endPlace } = summary;
  return [
    "Trip summary",
    summary.name ?? "New trip",
    tripDatesText(summary.startDate, summary.endDate) ?? "No dates yet",
    `${startPlace?.name ?? "Start not set yet"} to ${endPlace?.name ?? "end not set yet"}`,
    `${countText(summary.dayCount, "day")}, ${countText(summary.stayCount, "stay")}, ${summary.totalDriveTime} of driving`,
  ];
}

function stayLines(stay: ShownStay, cardNumber: CardNumber): string[] {
  const dates =
    stay.arriveDate === null || stay.leaveDate === null
      ? ""
      : `, ${dayText(stay.arriveDate)} to ${dayText(stay.leaveDate)}`;
  return [
    `Stay ${String(stay.number)}: ${stay.place.name}, ${countText(stay.nightCount, "night")}${dates}`,
    ...choiceLines("  Lodging: ", stay.lodging, cardNumber(stay.id)),
    ...weatherLines(stay.weather),
  ];
}

// With the credit its source asks for (functional spec 9.6).
function weatherLines(weather: ShownWeather | null): string[] {
  if (weather === null) {
    return ["  Weather and clothing: not written yet"];
  }
  const isForecast = weather.label === "forecast";
  const source = isForecast ? "a forecast" : "seasonal averages";
  const outOfDate = weather.isOutOfDate
    ? " Out of date: the stay has changed since this was written."
    : "";
  return [
    `  Weather and clothing, from ${source}, written ${dayText(weather.writtenOnDate)}.${outOfDate}`,
    `  ${weather.guidance}`,
    isForecast
      ? "  Includes data from Google Maps"
      : "  Weather data by Open-Meteo.com",
  ];
}

function dayLines(day: ShownDay, cardNumber: CardNumber): string[] {
  const heading = [
    `Day ${String(day.number)}`,
    day.date === null ? null : dayText(day.date),
    day.location,
  ].filter((part) => part !== null);
  const schedule =
    day.schedule.length === 0
      ? ["  Nothing scheduled yet."]
      : [
          ...day.schedule.flatMap((entry) => entryLines(entry, cardNumber)),
          ...(day.arrival === null
            ? []
            : [
                `  ${day.arrival.time ?? "Time not known"}: Arrive at ${day.arrival.place.name}`,
              ]),
        ];
  return [
    heading.join(" · "),
    `  ${day.isRestDay ? "Rest day. " : ""}Starts at ${day.startTime}`,
    ...(day.leg === null ? [] : legLines(day.leg)),
    ...schedule,
  ];
}

// A route type shows only when the user chose one for the day (functional spec 9.4).
function legLines(leg: ShownLeg): string[] {
  const facts =
    leg.driveTime === null || leg.distanceInMiles === null
      ? "not routed yet"
      : `${leg.driveTime}, ${String(Math.round(leg.distanceInMiles))} mi`;
  const along =
    leg.stopsAlongTheWay.length === 0
      ? ""
      : ` Along the way: ${leg.stopsAlongTheWay.join(", ")}.`;
  const routeType =
    leg.routeType === null
      ? []
      : [
          `  ${leg.routeType.routeType === "fastest" ? "Fastest" : "Scenic"} route, as you asked: "${leg.routeType.reason}"`,
        ];
  return [
    `  Drive: ${leg.from.name} to ${leg.to.name}, ${facts}.${along}`,
    ...routeType,
  ];
}

function entryLines(entry: ShownEntry, cardNumber: CardNumber): string[] {
  const times = timesText(entry);
  const prefix = `  ${times === "" ? "" : `${times}: `}`;
  const { stop } = entry;
  if (stop === null) {
    const name = entry.kind === "drive" ? "Drive" : "Free time";
    return [
      `${prefix}${entry.duration === null ? name : `${name}, ${entry.duration}`}`,
    ];
  }
  const setTime = stop.setTime === null ? "" : ` (set for ${stop.setTime})`;
  const label = `${prefix}${STOP_KIND_TEXT[stop.kind]}, ${stop.purpose}${setTime}: `;
  if (stop.kind === "checkIn") {
    return [`${label}${stop.checkInPlace?.name ?? "no stay to check in at"}`];
  }
  return choiceLines(label, stop.choice, cardNumber(stop.id));
}

// A selected place with why it was picked, an open card by its number, or how far
// along the choice is (functional spec 7.5 and 7.6).
function choiceLines(
  label: string,
  choice: ShownChoice,
  cardNumber: number,
): string[] {
  const { selection } = choice;
  if (choice.card !== null && cardNumber > 0) {
    return [`${label}option card ${String(cardNumber)} is open`];
  }
  if (selection === null) {
    return [
      choice.status === "empty"
        ? `${label}no options yet`
        : `${label}${countText(choice.candidateCount, "option")}, none picked yet`,
    ];
  }
  const source =
    selection.namedByUser || selection.sourceLink === null
      ? "You named this place."
      : `Source: ${selection.sourceLink}`;
  return [
    `${label}${selection.place.name}`,
    `      Why: ${selection.rationale} ${source}`,
  ];
}
