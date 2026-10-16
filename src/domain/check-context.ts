import type { Settings } from "../config/settings.schema.js";
import type { Calendar } from "./calendar.js";
import type { Itinerary } from "./itinerary.js";
import type { TripBrief } from "./trip-brief.js";

export type FeasibilitySettings = Pick<
  Settings,
  | "driveBufferPercent"
  | "lateAllowanceMinutes"
  | "stopOrderMinimumSavingMinutes"
>;

// What each check works from: the itinerary, and what the FeasibilityChecker is given
// (domain model 4.8).
export interface CheckContext {
  itinerary: Itinerary;
  calendar: Calendar;
  tripBrief: TripBrief;
  settings: FeasibilitySettings;
}
