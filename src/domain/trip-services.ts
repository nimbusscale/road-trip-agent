import type { Settings } from "../config/settings.schema.js";
import { Calendar } from "./calendar.js";
import { DaysService } from "./days-service.js";
import { ItineraryService } from "./itinerary-service.js";
import { RejectionsService } from "./rejections-service.js";
import { StaysService } from "./stays-service.js";
import { StopsService } from "./stops-service.js";
import type { Trip } from "./trip.js";
import { TripBriefService } from "./trip-brief-service.js";

// The services for one trip (domain model section 4). LegsService needs a route finder,
// and runs in the finish of a write, so TripWriter makes it from this calendar. The
// FeasibilityChecker runs in the finish too. Neither is here.
export interface TripServices {
  tripBrief: TripBriefService;
  itinerary: ItineraryService;
  stays: StaysService;
  days: DaysService;
  stops: StopsService;
  rejections: RejectionsService;
}

// The calendar and services for one trip, each given what it needs from the trip's
// brief, the settings, and the clock. A write makes them for its change (persistence
// design, section 8.2). `now` is the system clock in the app, and a fixed time in a
// test.
export function calendarAndServicesFor(
  trip: Trip,
  settings: Settings,
  now: () => Date,
): { calendar: Calendar; services: TripServices } {
  const calendar = new Calendar({ tripBrief: trip.tripBrief, settings, now });
  return {
    calendar,
    services: {
      tripBrief: new TripBriefService(settings),
      itinerary: new ItineraryService({ calendar }),
      stays: new StaysService({ settings, calendar }),
      days: new DaysService({ settings, calendar }),
      stops: new StopsService({ settings, calendar }),
      rejections: new RejectionsService(),
    },
  };
}
