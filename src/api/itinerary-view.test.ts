import { describe, expect, it } from "vitest";

import { TEST_USER_ID } from "../auth/test-tokens.js";
import { checkInDay } from "../domain/check-in.fake.js";
import { CalendarDate } from "../domain/calendar-date.js";
import { calendarFor, planningFor } from "../domain/example-trip-parts.fake.js";
import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { sanFranciscoExample } from "../domain/san-francisco-example.fake.js";
import {
  type ItineraryResponse,
  itineraryResponseSchema,
  type ShownDay,
} from "../shared/itinerary.schema.js";
import { chatApi } from "./chat-api.fake.js";
import { itineraryViewOf } from "./itinerary-view.js";

const PLANNING = new Date("2026-10-15T09:00:00Z");

function sanFranciscoView(): ItineraryResponse {
  const { trip, calendar } = sanFranciscoExample();
  return itineraryViewOf(trip, calendar);
}

function dayNumbered(view: ItineraryResponse, number: number): ShownDay {
  const day = view.days.find((each) => each.number === number);
  if (day === undefined) {
    throw new Error(`The view has no Day ${String(number)}.`);
  }
  return day;
}

// Each stop's arrival, in the day's schedule.
function stopTimes(day: ShownDay): [string | undefined, string | null][] {
  return day.schedule.flatMap((entry) =>
    entry.stop === null
      ? []
      : [[entry.stop.choice.selection?.place.name, entry.startTime]],
  );
}

describe("the itinerary view", () => {
  it("gives the San Francisco trip's summary and stays, as domain model 5.1 shows them", () => {
    const view = sanFranciscoView();
    expect(view.summary).toMatchObject({
      startDate: "2027-05-13",
      endDate: "2027-05-15",
      startPlace: { name: "San Francisco" },
      endPlace: { name: "Mike's house" },
      dayCount: 3,
      stayCount: 2,
    });
    expect(view.stays).toMatchObject([
      {
        number: 1,
        place: { name: "Monterey" },
        nightCount: 1,
        arriveDate: "2027-05-13",
        leaveDate: "2027-05-14",
        lodging: {
          status: "selected",
          selection: { place: { name: "Monterey hotel" } },
        },
      },
      { number: 2, place: { name: "San Luis Obispo" }, nightCount: 1 },
    ]);
  });

  it("gives San Francisco Day 1's leg and schedule, with the times domain model 5.1 shows", () => {
    const day1 = dayNumbered(sanFranciscoView(), 1);
    expect(day1).toMatchObject({
      date: "2027-05-13",
      location: "San Francisco → Monterey",
      startTime: "8:00 a.m.",
      isRestDay: false,
      leg: {
        from: { name: "San Francisco" },
        to: { name: "Monterey hotel" },
        routeType: null,
      },
    });
    expect(day1.leg?.stopsAlongTheWay).toEqual([
      "Millbrae Pancake House",
      "Hangar One, Moffett Field",
      "Philz Coffee, San Jose",
      "Santa Cruz Beach Boardwalk",
    ]);
    expect(stopTimes(day1)).toEqual([
      ["Millbrae Pancake House", "8:25 a.m."],
      ["Hangar One, Moffett Field", "9:50 a.m."],
      ["Philz Coffee, San Jose", "12:05 p.m."],
      ["Santa Cruz Beach Boardwalk", "1:55 p.m."],
      ["The Whaling Station", "7:00 p.m."],
    ]);
  });

  it("shows the free time before a dinner with a set time, and the drives with their lengths", () => {
    const day1 = dayNumbered(sanFranciscoView(), 1);
    const kinds = day1.schedule.map((entry) => entry.kind);
    expect(kinds.slice(-4)).toEqual(["drive", "freeTime", "stop", "drive"]);
    expect(day1.schedule[0]).toMatchObject({
      kind: "drive",
      startTime: "8:00 a.m.",
    });
    expect(day1.schedule[0]?.duration).toMatch(/m$/);
    expect(day1.arrival).toMatchObject({ place: { name: "Monterey hotel" } });
  });

  it("gives each selected place its rationale, marked as named by the user", () => {
    const day1 = dayNumbered(sanFranciscoView(), 1);
    const pancakes = day1.schedule.find((entry) => entry.stop !== null)?.stop;
    expect(pancakes).toMatchObject({
      number: 1,
      kind: "meal",
      purpose: "pancakes",
      choice: {
        status: "selected",
        selection: {
          rationale: "The user's pick.",
          namedByUser: true,
          sourceLink: null,
        },
      },
    });
  });

  it("shows the last day's route type with the user's reason", () => {
    const day3 = dayNumbered(sanFranciscoView(), 3);
    expect(day3).toMatchObject({
      isLastDay: true,
      leg: {
        to: { name: "Mike's house" },
        routeType: {
          routeType: "fastest",
          reason: "we want to get to LA quickly",
        },
      },
    });
  });

  it("marks a rest day, which has no leg, and gives a found place's source link", () => {
    const { trip } = exampleMoabTrip({ id: TEST_USER_ID });
    const view = itineraryViewOf(trip, calendarFor(trip, PLANNING));
    const day3 = dayNumbered(view, 3);
    expect(day3).toMatchObject({ isRestDay: true, leg: null, arrival: null });
    expect(day3.schedule).toMatchObject([
      {
        kind: "stop",
        startTime: "6:30 p.m.",
        stop: { choice: { status: "empty", selection: null } },
      },
    ]);
    const lodging = view.stays[0]?.lodging.selection;
    expect(lodging?.namedByUser).toBe(false);
    expect(lodging?.sourceLink).toMatch(/^https:/);
  });
});

describe("the itinerary view's weather", () => {
  it("gives each stay's weather text with its label and the date it was written, and none for a stay without one", () => {
    const { trip, moab } = exampleMoabTrip({ id: TEST_USER_ID });
    const planning = planningFor(trip, PLANNING);
    planning.services.stays.setWeatherText(
      trip.itinerary,
      moab,
      "Mild days and cool nights.",
    );
    const view = itineraryViewOf(trip, planning.calendar);
    expect(view.stays.map((stay) => stay.weather)).toEqual([
      {
        guidance: "Mild days and cool nights.",
        label: "seasonalAverages",
        writtenOnDate: "2026-10-15",
        isOutOfDate: false,
      },
      null,
    ]);
  });

  // Seasonal averages go out of date only when a date leaves their window of 7 days on
  // each side (domain model 4.1).
  it("marks a stay's weather out of date once its dates leave the window it was written for", () => {
    const { trip, moab } = exampleMoabTrip({ id: TEST_USER_ID });
    const planning = planningFor(trip, PLANNING);
    planning.services.stays.setWeatherText(
      trip.itinerary,
      moab,
      "Mild days and cool nights.",
    );
    planning.services.itinerary.setStartDate(
      trip.itinerary,
      new CalendarDate(2027, 10, 20),
    );
    const view = itineraryViewOf(trip, planning.calendar);
    expect(view.stays[0]?.weather?.isOutOfDate).toBe(true);
  });
});

describe("the itinerary view's route", () => {
  async function addMoabTrip(): Promise<{
    chat: Awaited<ReturnType<typeof chatApi>>;
    tripId: string;
  }> {
    const chat = await chatApi(PLANNING);
    const { trip, places } = exampleMoabTrip({ id: TEST_USER_ID });
    await chat.tripStore.add(trip);
    chat.tripStore.places.rows.push(
      ...places.map((place) => ({ tripId: trip.id, place })),
    );
    return { chat, tripId: trip.id };
  }

  it("shows a check-in at where the party sleeps that night, with no options to pick", async () => {
    const { trip, calendar, legs, checkIn } = checkInDay();
    await legs.updateLegs(trip.itinerary);
    const day1 = dayNumbered(itineraryViewOf(trip, calendar), 1);
    const entry = day1.schedule.find((each) => each.stop?.id === checkIn.id);
    expect(entry).toMatchObject({
      startTime: "3:57 p.m.",
      endTime: "4:27 p.m.",
      stop: {
        kind: "checkIn",
        purpose: "check in and freshen up",
        checkInPlace: { name: "Bar Harbor" },
        choice: { status: "empty", selection: null },
      },
    });
  });

  it("gives the owner the itinerary, in the shape the browser parses", async () => {
    const { chat, tripId } = await addMoabTrip();
    const response = await chat.asUser("GET", `/api/trips/${tripId}/itinerary`);
    expect(response.status).toBe(200);
    const view = itineraryResponseSchema.parse(await response.json());
    expect(view.stays).toHaveLength(2);
    expect(view.days[0]?.leg?.routeLine).toBe("_p~iF~ps|U_ulLnnqC");
  });

  it("refuses another user's trip as if it didn't exist", async () => {
    const { chat, tripId } = await addMoabTrip();
    const response = await chat.asOtherUser(
      "GET",
      `/api/trips/${tripId}/itinerary`,
    );
    expect(response.status).toBe(404);
  });
});
