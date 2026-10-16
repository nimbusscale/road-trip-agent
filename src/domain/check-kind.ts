// Which check found a check result. Each is one row of technical spec section 8's table
// (domain model section 2, and 3.3).
export const CHECK_KINDS = [
  "tripLengthVsBrief",
  "dailyDriving",
  "openingHoursNotLongEnough",
  "openingHoursClosed",
  "openingHoursNotKnown",
  "lateForSetTime",
  "stopOrder",
  "searchAreaDoesNotFitDay",
  "weatherOutOfDate",
  "forecastNowAvailable",
  "stayTierSetForDifferentNights",
] as const;

export type CheckKind = (typeof CHECK_KINDS)[number];

export const CHECK_LEVELS = ["warning", "note"] as const;

export type CheckLevel = (typeof CHECK_LEVELS)[number];
