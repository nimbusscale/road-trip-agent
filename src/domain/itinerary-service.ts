import type { Calendar } from "./calendar.js";
import type { CalendarDate } from "./calendar-date.js";
import type { Itinerary } from "./itinerary.js";
import { RuleError } from "./rule-error.js";
import { VIA_SERVICE } from "./via-service.js";

// The one rule about the itinerary's own properties that needs the calendar: a start
// date is after today (domain model 4.9).
export class ItineraryService {
  readonly #calendar: Calendar;

  constructor(given: { calendar: Calendar }) {
    this.#calendar = given.calendar;
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
