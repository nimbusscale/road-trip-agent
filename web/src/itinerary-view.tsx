import {
  type ItineraryResponse,
  itineraryResponseSchema,
  type ShownChoice,
  type ShownDay,
  type ShownEntry,
  type ShownLeg,
  type ShownStay,
  type ShownStop,
  type ShownSummary,
  type ShownWeather,
} from "../../src/shared/itinerary.schema";
import type { MessageRequest } from "../../src/shared/session.schema";
import { GoogleMapsCredit, OpenMeteoCredit } from "./credits";
import { dayText, tripDatesText } from "./dates";
import { countText, timesText } from "./itinerary-text";
import { type CardActions, type CardHolder, OptionCard } from "./option-card";
import { TripMap } from "./trip-map";
import { useApiAfterEachTurn } from "./use-api";

interface ItineraryViewProps {
  tripId: string;
  // Read again when a turn ends, since the coordinator may have changed the plan.
  busy: boolean;
  // Sends an option card's click to the chat. Null where there's no chat, such as on
  // the trip page, which shows no cards (functional spec 7.5).
  send: ((message: MessageRequest) => void) | null;
}

// The whole plan beside the chat: the trip summary, the map, the stays, and each day
// with its leg and schedule (functional spec 9). Read-only: only the coordinator changes it.
export function ItineraryView({ tripId, busy, send }: ItineraryViewProps) {
  const [loaded] = useApiAfterEachTurn(
    `/api/trips/${tripId}/itinerary`,
    itineraryResponseSchema,
    busy,
  );
  if (loaded.status === "loading") {
    return <p>Loading the itinerary…</p>;
  }
  if (loaded.status === "failed") {
    return <p role="alert">{loaded.message}</p>;
  }
  const cards = send === null ? null : { send, busy };
  return <Itinerary view={loaded.data} cards={cards} />;
}

interface ItineraryProps {
  view: ItineraryResponse;
  cards: CardActions | null;
}

function Itinerary({ view, cards }: ItineraryProps) {
  return (
    <>
      <Summary summary={view.summary} />
      <TripMap view={view} />
      <h3>Stays</h3>
      {view.stays.length === 0 ? (
        <p>No stays yet.</p>
      ) : (
        <ul className="stays">
          {view.stays.map((stay) => (
            <StayItem key={stay.id} stay={stay} cards={cards} />
          ))}
        </ul>
      )}
      <h3>Days</h3>
      {view.days.map((day) => (
        <DayCard key={day.id} day={day} cards={cards} />
      ))}
    </>
  );
}

function Summary({ summary }: { summary: ShownSummary }) {
  const { startPlace, endPlace } = summary;
  return (
    <section>
      <h3>Trip summary</h3>
      <p>
        <strong>{summary.name ?? "New trip"}</strong>
        <br />
        {tripDatesText(summary.startDate, summary.endDate) ?? "No dates yet"}
        <br />
        {startPlace?.name ?? "Start not set yet"} to{" "}
        {endPlace?.name ?? "end not set yet"}
        <br />
        {countText(summary.dayCount, "day")},{" "}
        {countText(summary.stayCount, "stay")}, {summary.totalDriveTime} of
        driving
      </p>
    </section>
  );
}

function StayItem({
  stay,
  cards,
}: {
  stay: ShownStay;
  cards: CardActions | null;
}) {
  const dates =
    stay.arriveDate === null || stay.leaveDate === null
      ? ""
      : `, ${dayText(stay.arriveDate)} to ${dayText(stay.leaveDate)}`;
  return (
    <li>
      <strong>
        Stay {stay.number}: {stay.place.name}
      </strong>
      , {countText(stay.nightCount, "night")}
      {dates}
      <br />
      Lodging:{" "}
      <Choice
        choice={stay.lodging}
        holder={{ id: stay.id, label: `the lodging in ${stay.place.name}` }}
        cards={cards}
      />
      <WeatherBlock weather={stay.weather} />
    </li>
  );
}

// The stay's weather and clothing text, with its label, an out-of-date mark, and the
// credit its source asks for, at the bottom of the block (functional spec 9.6).
function WeatherBlock({ weather }: { weather: ShownWeather | null }) {
  if (weather === null) {
    return (
      <div className="weather">
        <p>
          Weather and clothing: <em>not written yet</em>
        </p>
      </div>
    );
  }
  const isForecast = weather.label === "forecast";
  return (
    <div className="weather">
      <p>
        <strong>
          Weather and clothing, from{" "}
          {isForecast ? "a forecast" : "seasonal averages"}
        </strong>
        , written {dayText(weather.writtenOnDate)}
        {weather.isOutOfDate ? (
          <>
            {" "}
            <strong className="out-of-date">
              Out of date: the stay has changed since this was written.
            </strong>
          </>
        ) : null}
      </p>
      <p>{weather.guidance}</p>
      {isForecast ? <GoogleMapsCredit /> : <OpenMeteoCredit />}
    </div>
  );
}

function DayCard({ day, cards }: { day: ShownDay; cards: CardActions | null }) {
  const heading = [
    `Day ${String(day.number)}`,
    day.date === null ? null : dayText(day.date),
    day.location,
  ].filter((part) => part !== null);
  return (
    <section className="day boxed">
      <h4>{heading.join(" · ")}</h4>
      <p>
        {day.isRestDay ? <strong>Rest day. </strong> : null}
        Starts at {day.startTime}
      </p>
      {day.leg === null ? null : <LegLine leg={day.leg} />}
      {day.schedule.length === 0 ? (
        <p>Nothing scheduled yet.</p>
      ) : (
        <ol className="schedule">
          {keyedEntries(day.schedule).map(([key, entry]) => (
            <EntryItem
              key={key}
              entry={entry}
              dayNumber={day.number}
              cards={cards}
            />
          ))}
          {day.arrival === null ? null : (
            <li>
              <span className="time">
                {day.arrival.time ?? "Time not known"}
              </span>
              <span>Arrive at {day.arrival.place.name}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

// The day's drive: its ends, road time, distance, and stops along the way. A route
// type shows only when the user chose one for the day (functional spec 9.4).
function LegLine({ leg }: { leg: ShownLeg }) {
  const facts =
    leg.driveTime === null || leg.distanceInMiles === null
      ? "not routed yet"
      : `${leg.driveTime}, ${String(Math.round(leg.distanceInMiles))} mi`;
  return (
    <p>
      Drive: {leg.from.name} to {leg.to.name}, {facts}.
      {leg.stopsAlongTheWay.length === 0
        ? null
        : ` Along the way: ${leg.stopsAlongTheWay.join(", ")}.`}
      {leg.routeType === null ? null : (
        <>
          <br />
          {leg.routeType.routeType === "fastest" ? "Fastest" : "Scenic"} route,
          as you asked: &ldquo;{leg.routeType.reason}&rdquo;
        </>
      )}
    </p>
  );
}

interface EntryProps {
  entry: ShownEntry;
  dayNumber: number;
  cards: CardActions | null;
}

function EntryItem(props: EntryProps) {
  return (
    <li>
      <span className="time">{timesText(props.entry)}</span>
      <div>
        <EntryText {...props} />
      </div>
    </li>
  );
}

function EntryText({ entry, dayNumber, cards }: EntryProps) {
  const { stop } = entry;
  if (stop === null) {
    const name = entry.kind === "drive" ? "Drive" : "Free time";
    return entry.duration === null ? name : `${name}, ${entry.duration}`;
  }
  return (
    <>
      {KIND_TEXT[stop.kind]}, {stop.purpose}
      {stop.setTime === null ? null : ` (set for ${stop.setTime})`}:{" "}
      {stop.kind === "checkIn" ? (
        (stop.checkInPlace?.name ?? <em>no stay to check in at</em>)
      ) : (
        <Choice
          choice={stop.choice}
          holder={{
            id: stop.id,
            label: `the ${KIND_TEXT[stop.kind].toLowerCase()} "${stop.purpose}" on Day ${String(dayNumber)}`,
          }}
          cards={cards}
        />
      )}
    </>
  );
}

const KIND_TEXT: Record<ShownStop["kind"], string> = {
  meal: "Meal",
  attraction: "Attraction",
  checkIn: "Check in",
};

interface ChoiceProps {
  choice: ShownChoice;
  holder: CardHolder;
  cards: CardActions | null;
}

// A stop or lodging: its selected place, with why it was picked, its option card, or
// how far along the choice is (functional spec 7.5 and 7.6).
function Choice({ choice, holder, cards }: ChoiceProps) {
  const { selection, card } = choice;
  if (card !== null && cards !== null) {
    return <OptionCard card={card} holder={holder} actions={cards} />;
  }
  if (selection === null) {
    return choice.status === "empty" ? (
      <em>no options yet</em>
    ) : (
      <em>{countText(choice.candidateCount, "option")}, none picked yet</em>
    );
  }
  return (
    <details className="why">
      <summary>{selection.place.name}</summary>
      <p>{selection.rationale}</p>
      <p>
        {selection.namedByUser || selection.sourceLink === null ? (
          "You named this place."
        ) : (
          <a href={selection.sourceLink} target="_blank" rel="noreferrer">
            Source
          </a>
        )}
      </p>
    </details>
  );
}

// A stop by its ID, and a drive or free time by the stop after it. Between two stops
// there's at most one of each (domain model 4.1).
function keyedEntries(schedule: readonly ShownEntry[]): [string, ShownEntry][] {
  return schedule.map((entry, index) => {
    if (entry.stop !== null) {
      return [entry.stop.id, entry];
    }
    const next = schedule.slice(index).find((each) => each.stop !== null);
    return [`${entry.kind} before ${next?.stop?.id ?? "the end"}`, entry];
  });
}
