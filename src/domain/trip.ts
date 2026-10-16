import { newId } from "../ids/new-id.js";
import { Itinerary } from "./itinerary.js";
import { LastDay } from "./last-day.js";
import { DEFAULT_USUAL_START_TIME, TripBrief } from "./trip-brief.js";
import { hasStartedOn } from "./today.js";
import type { User } from "./user.js";

export interface TripFields {
  id: string;
  owner: User;
  tripBrief: TripBrief;
  itinerary: Itinerary;
  lastUpdatedDateTime: Date;
}

// One planned road trip (domain model 3.1). The started-trip lock isn't checked here:
// persistence checks it (domain model section 1).
export class Trip {
  readonly id: string;
  readonly owner: User;
  readonly tripBrief: TripBrief;
  readonly itinerary: Itinerary;
  // Code sets it when the trip is created, and at the end of every write.
  lastUpdatedDateTime: Date;

  constructor(fields: TripFields) {
    this.id = fields.id;
    this.owner = fields.owner;
    this.tripBrief = fields.tripBrief;
    this.itinerary = fields.itinerary;
    this.lastUpdatedDateTime = fields.lastUpdatedDateTime;
  }

  // The focus and the start month, such as "Pacific Coast Highway, May 2027". Empty
  // while the focus is, and the home screen shows "New trip". The focus alone while the
  // itinerary has no start date.
  get name(): string | null {
    const focus = this.tripBrief.focus;
    const startDate = this.itinerary.startDate;
    if (focus === null || startDate === null) {
      return focus;
    }
    return `${focus}, ${startDate.monthAndYear}`;
  }

  // True once today, in the start place's time zone, reaches the start date. False
  // while there's no start date. It takes the current moment, so a test can set the
  // time, such as just after midnight on the start date.
  hasStarted(now: Date): boolean {
    return hasStartedOn(
      this.itinerary.startDate,
      this.itinerary.startPlace,
      now,
    );
  }
}

// A new trip: a brief that holds only its usual start time, and an itinerary that
// holds only its last day (domain model 3.1, "A new trip").
export function newTrip(owner: User, now: Date): Trip {
  return new Trip({
    id: newId("trip"),
    owner,
    tripBrief: new TripBrief({
      id: newId("tripBrief"),
      focus: null,
      tripLengthInDays: null,
      interestsText: null,
      mustSeesText: null,
      comfortableDrivingInHours: null,
      routePreference: null,
      restDaysText: null,
      usualStartTime: DEFAULT_USUAL_START_TIME,
      defaultTier: null,
      budgetRulesText: null,
      mealPreferencesText: null,
    }),
    itinerary: new Itinerary({
      id: newId("itinerary"),
      startPlace: null,
      endPlace: null,
      startDate: null,
      stays: [],
      lastDay: new LastDay({
        id: newId("day"),
        ownStartTime: null,
        approvals: [],
      }),
      rejectedPlaces: [],
      checkResults: [],
    }),
    lastUpdatedDateTime: now,
  });
}
