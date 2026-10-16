import type { Calendar } from "./calendar.js";
import type { CalendarDate } from "./calendar-date.js";
import type { Itinerary } from "./itinerary.js";
import type { Place } from "./place.js";
import { RuleError } from "./rule-error.js";
import { VIA_SERVICE } from "./via-service.js";

// The rules about the itinerary's own properties that need the calendar: the start
// date is after today at the start place, both when the date is set and when the start
// place moves (domain model 4.9).
export class ItineraryService {
  readonly #calendar: Calendar;

  constructor(given: { calendar: Calendar }) {
    this.#calendar = given.calendar;
  }

  // Today follows the start place's time zone. So a start place further east can make
  // today reach the start date, and the trip would start at once (domain model 3.4).
  setStartPlace(itinerary: Itinerary, startPlace: Place): void {
    const startDate = itinerary.startDate;
    const today = this.#calendar.todayAt(startPlace);
    if (startDate !== null && startDate.compareTo(today) <= 0) {
      throw new RuleError(
        `The start date has to be after today at the start place. Today is ${today.longText} at ${startPlace.name ?? startPlace.address}, and the start date is ${startDate.longText}, so the trip would start at once. To move the start place there, set a later start date first.`,
      );
    }
    itinerary[VIA_SERVICE].setStartPlace(startPlace);
  }

  // While there's no start place, there's no today. The itinerary's own rule refuses
  // the date then.
  setStartDate(itinerary: Itinerary, startDate: CalendarDate): void {
    const today = this.#calendar.today(itinerary);
    if (today !== null && startDate.compareTo(today) <= 0) {
      throw new RuleError(
        `The start date has to be after today, ${today.longText}, at the start place. It was given ${startDate.longText}.`,
      );
    }
    itinerary[VIA_SERVICE].setStartDate(startDate);
  }
}
