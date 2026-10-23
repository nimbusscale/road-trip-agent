// Dates as the home screen and the trip page show them.

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  // A trip's dates are calendar dates, such as 2027-10-10, read as midnight UTC.
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

// Such as "Oct 23, 2026, 3:50 PM", in the browser's time zone.
export function momentText(isoText: string): string {
  return MOMENT.format(new Date(isoText));
}
