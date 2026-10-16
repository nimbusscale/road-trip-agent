import { describe, expect, it } from "vitest";

import type { Calendar } from "./calendar.js";
import { CalendarDate } from "./calendar-date.js";
import type { Day } from "./day.js";
import {
  at,
  calendarFor,
  meal,
  OWNER,
  pick,
  placeNamed,
  routeDay,
} from "./example-trip-parts.fake.js";
import type { Itinerary } from "./itinerary.js";
import { present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { OpeningPeriod } from "./opening-period.js";
import { sanFranciscoExample } from "./san-francisco-example.fake.js";
import type { ScheduleEntry } from "./schedule-entry.js";
import type { ScheduleTime } from "./schedule-time.js";
import { newStay } from "./stay.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip } from "./trip.js";
import { VIA_SERVICE } from "./via-service.js";

// Such as "8:25 a.m." or "1:00 a.m., next day", as the example trips show times.
function timeText(time: ScheduleTime | null): string | null {
  if (time === null) {
    return null;
  }
  const { hours, minutes } = time.time;
  const hour = String(hours % 12 === 0 ? 12 : hours % 12);
  const text = `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "a.m." : "p.m."}`;
  return time.isNextDay ? `${text}, next day` : text;
}

function describeEntry(entry: ScheduleEntry): string {
  const name = entry.stop?.selectedPlace?.name ?? entry.stop?.purpose;
  const label = name === undefined ? entry.kind : `${entry.kind} ${name}`;
  return `${label}: ${String(timeText(entry.startTime))} to ${String(timeText(entry.endTime))}`;
}

function stopTimes(
  calendar: Calendar,
  itinerary: Itinerary,
  day: Day,
): (string | null)[] {
  return calendar
    .scheduleOf(itinerary, day)
    .filter((entry) => entry.kind === "stop")
    .map((entry) => timeText(entry.startTime));
}

function arrival(calendar: Calendar, itinerary: Itinerary, day: Day): string {
  const entries = calendar.scheduleOf(itinerary, day);
  return String(timeText(entries.at(-1)?.endTime ?? null));
}

describe("the example trips' schedules, with made-up drive times", () => {
  it("come out as domain model 5.1 shows them", () => {
    const { trip, calendar } = sanFranciscoExample();
    const itinerary = trip.itinerary;
    const day1 = present(itinerary.days[0]);
    const day2 = present(itinerary.days[1]);
    const day3 = present(itinerary.days[2]);
    expect(stopTimes(calendar, itinerary, day1)).toEqual([
      "8:25 a.m.",
      "9:50 a.m.",
      "12:05 p.m.",
      "1:55 p.m.",
      "7:00 p.m.",
    ]);
    expect(stopTimes(calendar, itinerary, day2)).toEqual([
      "8:10 a.m.",
      "9:25 a.m.",
      "11:10 a.m.",
      "12:05 p.m.",
      "2:35 p.m.",
      "6:30 p.m.",
      "7:35 p.m.",
    ]);
    expect(calendar.startTimeOf(itinerary, day3).toText()).toBe("08:00");
    expect(arrival(calendar, itinerary, day3)).toBe("12:00 p.m.");
  });

  it("come out as domain model 5.2 shows them", () => {
    const { trip, calendar } = moabExample();
    const itinerary = trip.itinerary;
    const day1 = present(itinerary.days[0]);
    const day2 = present(itinerary.days[1]);
    const day3 = present(itinerary.days[2]);
    const day4 = present(itinerary.days[3]);
    const day5 = present(itinerary.days[4]);
    expect(stopTimes(calendar, itinerary, day1)).toEqual([
      "8:00 a.m.",
      "10:50 a.m.",
      "6:00 p.m.",
    ]);
    expect(stopTimes(calendar, itinerary, day2)).toEqual([
      "6:00 a.m.",
      "8:50 a.m.",
      "10:20 a.m.",
      "12:00 p.m.",
      "1:15 p.m.",
      "7:00 p.m.",
    ]);
    expect(stopTimes(calendar, itinerary, day3)).toEqual(["6:30 p.m."]);
    expect(stopTimes(calendar, itinerary, day4)).toEqual([
      "9:55 a.m.",
      "1:20 p.m.",
      "2:40 p.m.",
      "1:00 a.m., next day",
    ]);
    expect(calendar.startTimeOf(itinerary, day5).toText()).toBe("10:00");
    expect(arrival(calendar, itinerary, day5)).toBe("1:45 p.m.");
  });

  it("show a wait before a set time as free time before the drive", () => {
    const { trip, calendar } = sanFranciscoExample();
    const day1 = present(trip.itinerary.days[0]);
    const entries = calendar.scheduleOf(trip.itinerary, day1).slice(-4);
    expect(entries.map(describeEntry)).toEqual([
      "freeTime: 4:55 p.m. to 6:16 p.m.",
      "drive: 6:16 p.m. to 7:00 p.m.",
      "stop The Whaling Station: 7:00 p.m. to 8:00 p.m.",
      "drive: 8:00 p.m. to 8:06 p.m.",
    ]);
  });
});

describe("a day's schedule", () => {
  it("shows dessert at 6:30 on San Francisco Day 2, with dinner still empty", () => {
    const { trip, calendar, firestone, firestoneGrill, day2Segments } =
      sanFranciscoExample();
    const itinerary = trip.itinerary;
    const day2 = present(itinerary.days[1]);
    // A rejection is the only way a selection goes.
    firestone[VIA_SERVICE].removeCandidate(firestoneGrill);
    // Until the leg is routed again, its segments don't fit the selected stops.
    expect(stopTimes(calendar, itinerary, day2).every((t) => t === null)).toBe(
      true,
    );
    // Without the dinner, Piedras Blancas to the Madonna Inn is the same 60 minutes.
    routeDay(calendar, itinerary, day2, [...day2Segments.slice(0, 5), 54, 5]);
    expect(
      calendar.scheduleOf(itinerary, day2).slice(-6).map(describeEntry),
    ).toEqual([
      "stop Piedras Blancas elephant seal rookery: 2:35 p.m. to 3:35 p.m.",
      "freeTime: 3:35 p.m. to 5:30 p.m.",
      "drive: 5:30 p.m. to 6:30 p.m.",
      "stop tri-tip: 6:30 p.m. to 6:30 p.m.",
      "stop Copper Café, Madonna Inn: 6:30 p.m. to 7:30 p.m.",
      "drive: 7:30 p.m. to 7:36 p.m.",
    ]);
  });

  it("puts Moab Day 4's stargazing at 1:00 a.m. on the next day, with free time before it", () => {
    const { trip, calendar, torrey } = moabExample();
    const day4 = present(torrey.days[0]);
    const entries = calendar.scheduleOf(trip.itinerary, day4).slice(-5);
    expect(entries.map(describeEntry)).toEqual([
      "stop Capitol Gorge: 2:40 p.m. to 4:40 p.m.",
      "freeTime: 4:40 p.m. to 12:35 a.m., next day",
      "drive: 12:35 a.m., next day to 1:00 a.m., next day",
      "stop Panorama Point: 1:00 a.m., next day to 2:00 a.m., next day",
      "drive: 2:00 a.m., next day to 2:15 a.m., next day",
    ]);
  });

  it("has no drives on a rest day, which ends when its last stop ends", () => {
    const { trip, calendar, moab } = moabExample();
    const day3 = present(moab.days[2]);
    expect(
      calendar.scheduleOf(trip.itinerary, day3).map(describeEntry),
    ).toEqual([
      "freeTime: 8:00 a.m. to 6:30 p.m.",
      "stop The Spoke on Center: 6:30 p.m. to 7:30 p.m.",
    ]);
  });

  it("doesn't know the last drive's times while a stop with no place comes after the last selected one", () => {
    const { trip, calendar, sanLuisObispo } = sanFranciscoExample();
    const day2 = present(sanLuisObispo.days[0]);
    const nightcap = meal({ purpose: "a nightcap", searchArea: "alongLeg" });
    day2[VIA_SERVICE].placeStops([nightcap], day2.stops.at(-1) ?? null);
    const entries = calendar.scheduleOf(trip.itinerary, day2).slice(-3);
    expect(entries.map(describeEntry)).toEqual([
      "stop Copper Café, Madonna Inn: 7:35 p.m. to 8:35 p.m.",
      "stop a nightcap: null to null",
      "drive: null to null",
    ]);
  });

  it("has no drives on a day that stays put with no selected stop", () => {
    const trip = newTrip(OWNER, new Date());
    const itinerary = trip.itinerary;
    itinerary.startPlace = placeNamed("Grand Junction");
    itinerary.endPlace = placeNamed("Salt Lake City");
    const stay = newStay({
      place: placeNamed("Moab"),
      nightCount: 2,
      tier: "value",
      tierRule: "the trip default",
    });
    itinerary[VIA_SERVICE].placeStay(stay, null);
    const day2 = present(stay.days[1]);
    const breakfast = meal({
      purpose: "breakfast",
      searchArea: "nearStay",
      stay,
      setTime: at("09:00"),
    });
    day2[VIA_SERVICE].placeStops([breakfast], null);
    expect(
      calendarFor(trip).scheduleOf(itinerary, day2).map(describeEntry),
    ).toEqual(["stop breakfast: 9:00 a.m. to 9:00 a.m."]);
  });
});

describe("a stop's open time", () => {
  it("covers the four opening-hours results on the Moab trip", () => {
    const { trip, calendar, stops } = moabExample();
    const openTime = (stop: (typeof stops)["milts"]) =>
      calendar.openTimeInMinutesOf(trip.itinerary, stop);
    // Open 24 hours, so the whole 160-minute hike.
    expect(openTime(stops.delicateArch)).toBe(160);
    // Closes at 12:30 p.m. on a 12:00 arrival with an hour planned.
    expect(openTime(stops.milts)).toBe(30);
    // Closed Wednesdays.
    expect(openTime(stops.gifford)).toBe(0);
    // Google has no hours for it.
    expect(openTime(stops.fisherTowers)).toBeNull();
  });

  it("counts a bar open Monday from 5 p.m. to 2 a.m. as open at 1 a.m. on Tuesday", () => {
    const { trip, calendar, moab } = moabExample();
    const itinerary = trip.itinerary;
    const day2 = present(moab.days[1]);
    expect(calendar.dateOf(itinerary, day2)?.weekday).toBe("monday");
    const bar = meal({
      purpose: "a nightcap",
      searchArea: "nearStay",
      stay: moab,
      setTime: at("01:00", true),
    });
    day2[VIA_SERVICE].placeStops([bar], day2.stops.at(-1) ?? null);
    const barHours = new OpeningPeriod({
      openDay: "monday",
      openTime: TimeOfDay.fromText("17:00"),
      closeDay: "tuesday",
      closeTime: TimeOfDay.fromText("02:00"),
    });
    pick(bar, placeNamed("Woody's Tavern", [barHours]), 60);
    routeDay(calendar, itinerary, day2, [22, 9, 27, 5, 13, 13, 5, 5]);
    expect(calendar.openTimeInMinutesOf(itinerary, bar)).toBe(60);
  });

  it("is empty with no selected place", () => {
    const { trip, calendar, firestone, firestoneGrill } = sanFranciscoExample();
    firestone[VIA_SERVICE].removeCandidate(firestoneGrill);
    expect(calendar.openTimeInMinutesOf(trip.itinerary, firestone)).toBeNull();
  });

  it("reads the weekday from the day's date", () => {
    expect(new CalendarDate(2027, 5, 13).weekday).toBe("thursday");
    expect(new CalendarDate(2027, 10, 10).weekday).toBe("sunday");
  });
});
