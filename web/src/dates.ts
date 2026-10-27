// Dates as the home screen, the trip page, and the itinerary view show them, in US
// formats (functional spec 9.7).

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  // A trip's dates are calendar dates, such as 2027-10-10, read as midnight UTC.
  timeZone: "UTC",
});

const WEEKDAY_AND_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MOMENT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Such as "Oct 10, 2027 – Oct 16, 2027". Null while the trip has no start date.
export function tripDatesText(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (startDate === null || endDate === null) {
    return null;
  }
  return `${DAY.format(new Date(startDate))} – ${DAY.format(new Date(endDate))}`;
}

// Such as "Thu, May 13, 2027", for a day of the trip.
export function dayText(date: string): string {
  return WEEKDAY_AND_DAY.format(new Date(date));
}

// Such as "Oct 23, 2026, 3:50 PM", in the browser's time zone.
export function momentText(isoText: string): string {
  return MOMENT.format(new Date(isoText));
}
