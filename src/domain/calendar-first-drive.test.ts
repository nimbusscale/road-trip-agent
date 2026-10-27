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
import { newStay } from "./stay.js";
import type { Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";

// The day's first drive leaves at the day's start time, so the wait for the first
// selected stop's set time comes after it (domain model 4.1, "How the schedule is
// worked out"). Later waits stay before the drive on, as the example trips show in
// calendar-schedule.test.ts.

// Day 1 of a trip from Natick to Bar Harbor. It starts at 10:00 a.m., and its only
// selected stop is an alumni event set for 6:00 p.m., 5 h 25 m away with the drive
// buffer. The stops given, with no place yet, go before the event.
function barHarborDay1(before: readonly Stop[]) {
  const trip = newTrip(OWNER, new Date());
  const itinerary = trip.itinerary;
  const calendar = calendarFor(trip);
  itinerary[VIA_SERVICE].setStartPlace(placeNamed("Natick"));
  itinerary.endPlace = placeNamed("Natick");
  const stay = newStay({
    place: placeNamed("Bar Harbor"),
    nightCount: 1,
    tier: "value",
    tierRule: "the trip default",
  });
  itinerary[VIA_SERVICE].placeStay(stay, null);
  const day1 = present(stay.days[0]);
  day1.ownStartTime = TimeOfDay.fromText("10:00");
  const event = attraction({
    purpose: "the alumni event",
    searchArea: "nearStay",
    stay,
    setTime: at("18:00"),
  });
  day1[VIA_SERVICE].placeStops([...before, event], null);
  pick(planningFor(trip), event, placeNamed("College of the Atlantic"), 180);
  // 295 minutes of road time is 5 h 25 m with the 10% buffer.
  routeDay(calendar, itinerary, day1, [295, 5]);
  const schedule = () =>
    calendar.scheduleOf(itinerary, day1).map(describeEntry);
  return { trip, calendar, day1, schedule };
}

describe("a day's first drive", () => {
  it("leaves at the day's start time, with the wait for the first stop's set time after it", () => {
    const lunch = meal({ purpose: "lunch", searchArea: "alongLeg" });
    expect(barHarborDay1([lunch]).schedule()).toEqual([
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
    expect(barHarborDay1([lunch, coffee]).schedule()).toEqual([
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
    const { trip, calendar, day1, schedule } = barHarborDay1([lunch]);
    pick(planningFor(trip), lunch, placeNamed("Moody's Diner"));
    routeDay(calendar, trip.itinerary, day1, [180, 115, 5]);
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
