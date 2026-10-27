import type { Calendar } from "./calendar.js";
import { CalendarDate } from "./calendar-date.js";
import {
  ALWAYS_OPEN,
  at,
  attraction,
  fillDay,
  lodgeAt,
  meal,
  openOn,
  OWNER,
  type PickedStop,
  placeNamed,
  PLANNED_AT,
  type Planning,
  planningFor,
  routeDay,
} from "./example-trip-parts.fake.js";
import { examplePlace } from "./place.fake.js";
import type { Stay } from "./stay.js";
import type { Stop } from "./stop.js";
import { TimeOfDay } from "./time-of-day.js";
import { newTrip, type Trip } from "./trip.js";
import type { TripServices } from "./trip-services.js";
import { Waypoint } from "./waypoint.js";

// A three-night stay with a rest day: Grand Junction to Salt Lake City through Moab
// (domain model 5.2), for tests, built through the services. The drive times and visit
// times are made up, so the schedule's times come out as the example shows them. The hours are the example's
// "assume" hours.

export interface MoabExample {
  trip: Trip;
  calendar: Calendar;
  services: TripServices;
  moab: Stay;
  torrey: Stay;
  stops: {
    fisherTowers: Stop;
    delicateArch: Stop;
    milts: Stop;
    gifford: Stop;
    panoramaPoint: Stop;
  };
}

export function moabExample(): MoabExample {
  const trip = newTrip(OWNER, PLANNED_AT);
  const planning = planningFor(trip);
  const { itinerary, calendar, services } = planning;
  // The brief items the example uses, which the checks compare against.
  services.tripBrief.setTripLength(trip.tripBrief, 5);
  services.tripBrief.setComfortableDriving(trip.tripBrief, 4);
  services.itinerary.setStartPlace(
    itinerary,
    examplePlace({
      name: "Grand Junction",
      googlePlaceId: "google-Grand Junction",
      latitude: 39.0639,
      longitude: -108.5506,
    }),
  );
  itinerary.endPlace = placeNamed("Salt Lake City");
  services.itinerary.setStartDate(itinerary, new CalendarDate(2027, 10, 10));
  const moab = addStay(planning, "Moab", 3, null);
  const torrey = addStay(planning, "Torrey", 1, moab);
  const { fisherTowers } = layOutDay1(planning, moab);
  const { delicateArch, milts } = layOutDay2(planning, moab);
  layOutDay3(planning, moab);
  const { gifford, panoramaPoint } = layOutDay4(planning, torrey);
  const [day1, day2] = moab.days;
  const day4 = torrey.days[0];
  routeDay(calendar, itinerary, day1, [0, 100, 27, 2]);
  day1?.setWaypoints([deweyBridge()]);
  routeDay(calendar, itinerary, day2, [22, 9, 27, 5, 13, 13, 5]);
  routeDay(calendar, itinerary, day4, [104, 77, 18, 22, 13]);
  if (day4 !== undefined) {
    services.days.approveDriveHours(
      day4,
      5,
      "we want to see the hoodoos and Capitol Reef on the way",
    );
  }
  itinerary.lastDay.ownStartTime = TimeOfDay.fromText("10:00");
  routeDay(calendar, itinerary, itinerary.lastDay, [204]);
  return {
    trip,
    calendar,
    services,
    moab,
    torrey,
    stops: { fisherTowers, delicateArch, milts, gifford, panoramaPoint },
  };
}

// It keeps Day 1 on UT-128 along the river (domain model 5.2).
function deweyBridge(): Waypoint {
  return new Waypoint({
    place: placeNamed("Dewey Bridge"),
    reason: "steer onto UT-128",
  });
}

function addStay(
  planning: Planning,
  town: string,
  nightCount: number,
  after: Stay | null,
): Stay {
  const stay = planning.services.stays.addStay(planning.itinerary, {
    place: placeNamed(town),
    nightCount,
    after,
  });
  lodgeAt(planning, stay, placeNamed(`${town} hotel`));
  return stay;
}

function layOutDay1(planning: Planning, moab: Stay): { fisherTowers: Stop } {
  const fisherTowers = attraction({
    purpose: "towers",
    searchArea: "alongLeg",
  });
  fillDay(planning, moab.days[0], [
    [
      meal({ purpose: "breakfast", searchArea: "nearStartPlace" }),
      placeNamed("Grand Junction café"),
      60,
    ],
    // Google has no hours for it.
    [fisherTowers, placeNamed("Fisher Towers viewpoint"), 120],
    [
      meal({
        purpose: "local beer",
        searchArea: "nearStay",
        stay: moab,
        setTime: at("18:00"),
      }),
      placeNamed("Moab Brewery"),
      60,
    ],
  ]);
  return { fisherTowers };
}

function layOutDay2(
  planning: Planning,
  moab: Stay,
): { delicateArch: Stop; milts: Stop } {
  const near = { searchArea: "nearStay", stay: moab } as const;
  const delicateArch = attraction({
    ...near,
    purpose: "a sunrise hike",
    setTime: at("06:00"),
  });
  const milts = meal({ ...near, purpose: "burgers", setTime: at("12:00") });
  const day2 = moab.days[1];
  if (day2 !== undefined) {
    day2.ownStartTime = TimeOfDay.fromText("05:30");
  }
  const stops: PickedStop[] = [
    [delicateArch, placeNamed("Delicate Arch trail", [ALWAYS_OPEN]), 160],
    [attraction({ ...near, purpose: "arches" }), placeNamed("Windows"), 60],
    [meal({ ...near, purpose: "café" }), placeNamed("Love Muffin Cafe"), 60],
    [milts, placeNamed("Milt's", [openOn("monday", "10:30", "12:30")]), 60],
    [
      attraction({ ...near, purpose: "a hike" }),
      placeNamed("Corona Arch"),
      150,
    ],
    [
      meal({ ...near, purpose: "dinner out", setTime: at("19:00") }),
      placeNamed("Desert Bistro"),
      60,
    ],
  ];
  fillDay(planning, day2, stops);
  return { delicateArch, milts };
}

function layOutDay3(planning: Planning, moab: Stay): void {
  const day3 = moab.days[2];
  fillDay(planning, day3, [
    [
      meal({
        purpose: "dinner near the hotel",
        searchArea: "nearStay",
        stay: moab,
        setTime: at("18:30"),
      }),
      placeNamed("The Spoke on Center"),
      60,
    ],
  ]);
  if (day3 !== undefined) {
    planning.services.days.setRestDay(planning.itinerary, day3, true);
  }
}

function layOutDay4(
  planning: Planning,
  torrey: Stay,
): { gifford: Stop; panoramaPoint: Stop } {
  const gifford = meal({ purpose: "pie", searchArea: "alongLeg" });
  const panoramaPoint = attraction({
    purpose: "stargazing",
    searchArea: "nearStay",
    stay: torrey,
    setTime: at("01:00", true),
  });
  // Closed Wednesdays.
  const giffordHours = [
    openOn("tuesday", "11:00", "17:00"),
    openOn("thursday", "11:00", "17:00"),
  ];
  fillDay(planning, torrey.days[0], [
    [
      attraction({ purpose: "hoodoos", searchArea: "alongLeg" }),
      placeNamed("Goblin Valley State Park"),
      120,
    ],
    [gifford, placeNamed("Gifford Homestead", giffordHours), 60],
    [
      attraction({ purpose: "a canyon walk", searchArea: "alongLeg" }),
      placeNamed("Capitol Gorge"),
      120,
    ],
    [panoramaPoint, placeNamed("Panorama Point"), 60],
  ]);
  return { gifford, panoramaPoint };
}
