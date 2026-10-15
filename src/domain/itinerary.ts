import type { LastDay } from "./last-day.js";

export interface ItineraryFields {
  id: string;
  lastDay: LastDay;
}

// The plan (domain model 3.4). For now it holds only its last day. Phase 16 adds the
// start and end places, the start date, the stays, and the rest.
export class Itinerary {
  readonly id: string;
  readonly lastDay: LastDay;

  constructor(fields: ItineraryFields) {
    this.id = fields.id;
    this.lastDay = fields.lastDay;
  }
}
