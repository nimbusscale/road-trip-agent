import { describe, expect, it } from "vitest";

import {
  at,
  attraction,
  calendarFor,
  meal,
  OWNER,
  pick,
  placeNamed,
  planningFor,
  routeDay,
} from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { describeEntry } from "./schedule-entry.fake.js";
import { newStay, type Stay } from "./stay.js";
import type { Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";

// The day's first drive leaves at the day's start time, so the wait for the first
// selected stop's set time comes after it (domain model 4.1, "How the schedule is
// worked out"). Later waits stay before the drive on, as the example trips show in
// calendar-schedule.test.ts.

// A day of a trip from Natick to Bar Harbor. It starts at 10:00 a.m., or the time
// given, and its only selected stop is an alumni event set for 6:00 p.m., 5 h 25 m away
// with the drive buffer. It's Day 1, or with `afterPortland`, Day 2, after a night in
// Portland. The stops given, with no place yet, go before the event. They're made with
// the stay the day starts at, which is empty on Day 1.
function barHarborDay(
  before: (startStay: Stay | null) => readonly Stop[],
  { startTime = "10:00", afterPortland = false } = {},
) {
  const trip = newTrip(OWNER, new Date());
  const itinerary = trip.itinerary;
  const calendar = calendarFor(trip);
  itinerary[VIA_SERVICE].setStartPlace(placeNamed("Natick"));
  itinerary.endPlace = placeNamed("Natick");
  const portland = afterPortland ? oneNightIn("Portland") : null;
  if (portland !== null) {
    itinerary[VIA_SERVICE].placeStay(portland, null);
  }
  const stay = oneNightIn("Bar Harbor");
  itinerary[VIA_SERVICE].placeStay(stay, portland);
  const day = present(stay.days[0]);
  day.ownStartTime = TimeOfDay.fromText(startTime);
  const event = attraction({
    purpose: "the alumni event",
    searchArea: "nearStay",
    stay,
    setTime: at("18:00"),
  });
  day[VIA_SERVICE].placeStops([...before(portland), event], null);
  pick(planningFor(trip), event, placeNamed("College of the Atlantic"), 180);
  // 295 minutes of road time is 5 h 25 m with the 10% buffer.
  routeDay(calendar, itinerary, day, [295, 5]);
  const schedule = () => calendar.scheduleOf(itinerary, day).map(describeEntry);
  return { trip, calendar, day, schedule };
}

function oneNightIn(town: string): Stay {
  return newStay({
    place: placeNamed(town),
    nightCount: 1,
    tier: "value",
    tierRule: "the trip default",
  });
}

describe("a day's first drive", () => {
  it("leaves at the day's start time, with the wait for the first stop's set time after it", () => {
    const lunch = meal({ purpose: "lunch", searchArea: "alongLeg" });
    expect(barHarborDay(() => [lunch]).schedule()).toEqual([
      "drive: 10:00 a.m. to 3:25 p.m.",
      "stop lunch: null to null",
      "freeTime: 3:25 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });

  it("is followed by a stop with no place whose time falls during it, and one whose time falls in the free time splits it", () => {
    const lunch = meal({
      purpose: "lunch",
      searchArea: "alongLeg",
      setTime: at("12:00"),
    });
    const coffee = meal({
      purpose: "coffee",
      searchArea: "alongLeg",
      setTime: at("16:30"),
    });
    expect(barHarborDay(() => [lunch, coffee]).schedule()).toEqual([
      "drive: 10:00 a.m. to 3:25 p.m.",
      "stop lunch: 12:00 p.m. to 12:00 p.m.",
      "freeTime: 3:25 p.m. to 4:30 p.m.",
      "stop coffee: 4:30 p.m. to 4:30 p.m.",
      "freeTime: 4:30 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });

  it("leaves the later wait before the drive on, once the stop before it has a place", () => {
    const lunch = meal({ purpose: "lunch", searchArea: "alongLeg" });
    const { trip, calendar, day, schedule } = barHarborDay(() => [lunch]);
    pick(planningFor(trip), lunch, placeNamed("Moody's Diner"));
    routeDay(calendar, trip.itinerary, day, [180, 115, 5]);
    expect(schedule()).toEqual([
      "drive: 10:00 a.m. to 1:18 p.m.",
      "stop Moody's Diner: 1:18 p.m. to 2:18 p.m.",
      "freeTime: 2:18 p.m. to 3:53 p.m.",
      "drive: 3:53 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });
});

describe("a day's first drive, after a stop with no place near where the day starts", () => {
  it("leaves after one near the start place, whose time falls before the drive has to leave", () => {
    const breakfast = meal({
      purpose: "breakfast",
      searchArea: "nearStartPlace",
      setTime: at("11:00"),
    });
    expect(barHarborDay(() => [breakfast]).schedule()).toEqual([
      "freeTime: 10:00 a.m. to 11:00 a.m.",
      "stop breakfast: 11:00 a.m. to 11:00 a.m.",
      "drive: 11:00 a.m. to 4:25 p.m.",
      "freeTime: 4:25 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });

  it("leaves after one near the stay the party slept at, and still passes a stop along the leg", () => {
    const { schedule } = barHarborDay(
      (portland) => [
        meal({
          purpose: "breakfast",
          searchArea: "nearStay",
          stay: present(portland),
          setTime: at("08:00"),
        }),
        meal({
          purpose: "lunch",
          searchArea: "alongLeg",
          setTime: at("12:00"),
        }),
      ],
      { startTime: "07:00", afterPortland: true },
    );
    expect(schedule()).toEqual([
      "freeTime: 7:00 a.m. to 8:00 a.m.",
      "stop breakfast: 8:00 a.m. to 8:00 a.m.",
      "drive: 8:00 a.m. to 1:25 p.m.",
      "stop lunch: 12:00 p.m. to 12:00 p.m.",
      "freeTime: 1:25 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });

  it("leaves after one with no time, at the day's start time", () => {
    const breakfast = meal({
      purpose: "breakfast",
      searchArea: "nearStartPlace",
    });
    expect(barHarborDay(() => [breakfast]).schedule()).toEqual([
      "stop breakfast: null to null",
      "drive: 10:00 a.m. to 3:25 p.m.",
      "freeTime: 3:25 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });

  it("doesn't leave after one with no time that follows one whose time would miss the arrival", () => {
    const breakfast = meal({
      purpose: "breakfast",
      searchArea: "nearStartPlace",
      setTime: at("13:00"),
    });
    const coffee = meal({ purpose: "coffee", searchArea: "nearStartPlace" });
    expect(barHarborDay(() => [breakfast, coffee]).schedule()).toEqual([
      "drive: 10:00 a.m. to 3:25 p.m.",
      "stop breakfast: 1:00 p.m. to 1:00 p.m.",
      "stop coffee: null to null",
      "freeTime: 3:25 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });

  it("leaves at the day's start time when waiting for it would miss the arrival", () => {
    const breakfast = meal({
      purpose: "breakfast",
      searchArea: "nearStartPlace",
      setTime: at("13:00"),
    });
    expect(barHarborDay(() => [breakfast]).schedule()).toEqual([
      "drive: 10:00 a.m. to 3:25 p.m.",
      "stop breakfast: 1:00 p.m. to 1:00 p.m.",
      "freeTime: 3:25 p.m. to 6:00 p.m.",
      "stop College of the Atlantic: 6:00 p.m. to 9:00 p.m.",
      "drive: 9:00 p.m. to 9:06 p.m.",
    ]);
  });
});
