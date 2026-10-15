import type { Settings } from "../config/settings.schema.js";
import { RuleError } from "./rule-error.js";
import type { TripBrief } from "./trip-brief.js";
import { VIA_SERVICE } from "./via-service.js";

export type TripBriefSettings = Pick<
  Settings,
  "maximumTripLengthDays" | "maximumDailyDrivingHours"
>;

// The two trip brief items whose limits are settings (domain model section 4.2). The
// brief runs its own rules after these, such as a trip length of at least 1.
export class TripBriefService {
  constructor(private readonly settings: TripBriefSettings) {}

  setTripLength(brief: TripBrief, tripLengthInDays: number): void {
    const maximum = this.settings.maximumTripLengthDays;
    if (tripLengthInDays > maximum) {
      throw new RuleError(
        `A trip is at most ${String(maximum)} days long. It was given ${String(tripLengthInDays)}.`,
      );
    }
    brief[VIA_SERVICE].setTripLengthInDays(tripLengthInDays);
  }

  setComfortableDriving(
    brief: TripBrief,
    comfortableDrivingInHours: number,
  ): void {
    const maximum = this.settings.maximumDailyDrivingHours;
    if (comfortableDrivingInHours > maximum) {
      throw new RuleError(
        `Comfortable driving is at most ${String(maximum)} hours a day. It was given ${String(comfortableDrivingInHours)}.`,
      );
    }
    brief[VIA_SERVICE].setComfortableDrivingInHours(comfortableDrivingInHours);
  }
}
