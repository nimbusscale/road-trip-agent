import { describe, expect, it } from "vitest";

import { planningFor } from "./example-trip-parts.fake.js";
import { moabExample } from "./moab-example.fake.js";

describe("StaysService.setWeatherText", () => {
  it("labels it seasonal averages when a date is more than 7 days away, and records what it was written for", () => {
    const { trip, calendar, services, torrey, stops } = moabExample();
    const itinerary = trip.itinerary;
    const text = services.stays.setWeatherText(
      itinerary,
      torrey,
      "Cold nights. Bring a warm layer for stargazing.",
    );
    expect(torrey.weatherText).toBe(text);
    expect(text.label).toBe("seasonalAverages");
    expect(text.writtenOnDate.toText()).toBe("2026-10-15");
    expect(text.writtenForPlace).toBe(torrey.place);
    expect(text.writtenForDates.map((date) => date.toText())).toEqual([
      "2027-10-13",
      "2027-10-14",
    ]);
    const records = text.writtenForActivities;
    expect(records.map((record) => record.stopId)).toContain(
      stops.panoramaPoint.id,
    );
    expect(records).toHaveLength(3);
    expect(calendar.isWeatherOutOfDate(itinerary, torrey)).toBe(false);
  });

  it("labels it a forecast when every date is within 7 days of today, counting today as day 0", () => {
    const { trip, torrey } = moabExample();
    // October 6, 2027 in Utah: Torrey's dates, October 13 and 14, are days 7 and 8.
    const onOctober6 = planningFor(trip, new Date("2027-10-06T18:00:00Z"));
    const seasonal = onOctober6.services.stays.setWeatherText(
      trip.itinerary,
      torrey,
      "Cold nights.",
    );
    expect(seasonal.label).toBe("seasonalAverages");
    const onOctober7 = planningFor(trip, new Date("2027-10-07T18:00:00Z"));
    const forecast = onOctober7.services.stays.setWeatherText(
      trip.itinerary,
      torrey,
      "Cold nights.",
    );
    expect(forecast.label).toBe("forecast");
  });

  it("refuses empty guidance, by the weather text's own rule", () => {
    const { trip, services, torrey } = moabExample();
    expect(() =>
      services.stays.setWeatherText(trip.itinerary, torrey, "  "),
    ).toThrow("A weather text's guidance can't be empty.");
    expect(torrey.weatherText).toBeNull();
  });
});
