import { CalendarDate } from "./calendar-date.js";
import {
  at,
  attraction,
  meal,
  OWNER,
  pick,
  PLANNED_AT,
  type Planning,
  planningFor,
  EXAMPLE_SETTINGS,
} from "./example-trip-parts.fake.js";
import { present } from "./itinerary.fake.js";
import { legsFor, placeAt, type WithLegs } from "./legs.fake.js";
import type { Stay } from "./stay.js";
import type { StayDay } from "./stay-day.js";
import type { Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip } from "./trip.js";

// The day from issue #169, for the check-in tests: Natick to Bar Harbor, leaving at
// 10:00, with lunch on the way, a check-in at the stay, and the College of the
// Atlantic alumni event set for 6:00 p.m. The party then drives back to the stay.

export const NATICK = placeAt("Natick", 42.2834, -71.3495);
export const LUNCH_PLACE = placeAt("Lunch place", 43.6591, -70.2568);
export const BAR_HARBOR = placeAt("Bar Harbor", 44.3876, -68.2039);
export const COLLEGE = placeAt("College of the Atlantic", 44.3946, -68.2181);
export const BAR_HARBOR_INN = placeAt("Bar Harbor Inn", 44.3891, -68.2025);

// Each segment's drive time, without the buffer: Natick to lunch, lunch to the stay,
// the stay to the college, and the college back to the stay.
export const DAY_1_DRIVES = [150, 120, 8, 8];

export interface CheckInDay extends Planning, WithLegs {
  barHarbor: Stay;
  day1: StayDay;
  lunch: Stop;
  checkIn: Stop;
  event: Stop;
}

export function checkInDay(): CheckInDay {
  const planning = planningFor(newTrip(OWNER, PLANNED_AT, EXAMPLE_SETTINGS));
  const { itinerary, services } = planning;
  services.itinerary.setStartPlace(itinerary, NATICK);
  itinerary.endPlace = NATICK;
  services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 6, 11));
  const barHarbor = services.stays.addStay(itinerary, {
    place: BAR_HARBOR,
    nightCount: 2,
    after: null,
  });
  const day1 = present(barHarbor.days[0]);
  day1.ownStartTime = new TimeOfDay(10, 0);
  const lunch = meal({ purpose: "lunch on the way", searchArea: "alongLeg" });
  const checkIn = services.stops.newCheckIn("check in and freshen up", null);
  const event = attraction({
    purpose: "the alumni event",
    searchArea: "nearStay",
    stay: barHarbor,
    setTime: at("18:00"),
  });
  services.stops.addStops(itinerary, day1, [lunch, checkIn, event], null);
  pick(planning, lunch, LUNCH_PLACE);
  pick(planning, event, COLLEGE, 120);
  const withLegs = legsFor(planning);
  withLegs.finder.driveTimesFor = (path) =>
    path.through.length === DAY_1_DRIVES.length - 1 ? DAY_1_DRIVES : null;
  return { ...planning, ...withLegs, barHarbor, day1, lunch, checkIn, event };
}
