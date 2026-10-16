import { newId } from "../ids/new-id.js";
import { OpeningPeriod } from "./opening-period.js";
import { Place, type PlaceFields } from "./place.js";
import { TimeOfDay } from "./time-of-day.js";

// A place for tests: Smitty's Market, open Monday 7 a.m. to 6 p.m., with a new ID.
// Tests change the fields they care about.
export function examplePlace(changes: Partial<PlaceFields> = {}): Place {
  return new Place({
    id: newId("place"),
    googlePlaceId: "ChIJUV8aVvFWQ4YRZfcmdUS-yAI",
    name: "Smitty's Market",
    type: "Barbecue Restaurant",
    address: "208 S Commerce St, Lockhart, TX 78644, USA",
    latitude: 29.8836284,
    longitude: -97.6709195,
    rating: 4.4,
    reviewCount: 3697,
    priceLevel: "moderate",
    openingPeriods: [
      new OpeningPeriod({
        openDay: "monday",
        openTime: new TimeOfDay(7, 0),
        closeDay: "monday",
        closeTime: new TimeOfDay(18, 0),
      }),
    ],
    weekdayHoursLines: ["Monday: 7:00 AM – 6:00 PM"],
    summaries: ["Acclaimed BBQ spot."],
    links: ["https://maps.google.com/?cid=200619384650528613"],
    ...changes,
  });
}

// A street address, which Google gives no name or type (domain model 3.10).
export function exampleAddress(): Place {
  return examplePlace({
    googlePlaceId: "ChIJEX1Gu_pWQ4YRp13kgnRFwCg",
    name: null,
    type: null,
    address: "712 Neches St, Lockhart, TX 78644, USA",
    rating: null,
    reviewCount: null,
    priceLevel: null,
    openingPeriods: [],
    weekdayHoursLines: [],
    summaries: [],
  });
}
