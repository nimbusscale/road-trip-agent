import { Day, type DayChanges, type DayFields } from "./day.js";
import { VIA_SERVICE } from "./via-service.js";

export interface StayDayFields extends DayFields {
  isRestDay: boolean;
}

export interface StayDayChanges extends DayChanges {
  // Marking it a rest day removes its leg, with its waypoints. Its approvals stay.
  setRestDay(isRestDay: boolean): void;
}

// A day that ends with a night at a stay. The stay holds it (domain model 3.6).
export class StayDay extends Day {
  readonly kind = "stayDay" as const;
  #isRestDay: boolean;

  override readonly [VIA_SERVICE]: StayDayChanges = {
    ...this.dayChanges(),
    setRestDay: (isRestDay) => {
      this.#isRestDay = isRestDay;
      if (isRestDay) {
        this.dayChanges().setLeg(null);
      }
    },
  };

  constructor(fields: StayDayFields) {
    super(fields);
    this.#isRestDay = fields.isRestDay;
  }

  // A day with no driving. DaysService.setRestDay() changes it.
  get isRestDay(): boolean {
    return this.#isRestDay;
  }
}
