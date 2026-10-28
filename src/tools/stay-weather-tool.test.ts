import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { plannedMoab } from "./skeleton-tools.fake.js";
import { setStayWeatherTool } from "./stay-weather-tool.js";
import { textOf } from "./stored-trip.fake.js";

// set_stay_weather over the Moab example as planned (domain model 5.2), in the fake
// store. Today is October 15, 2026, so the trip in October 2027 gets seasonal averages.

async function moabWeather() {
  const planned = await plannedMoab();
  const tripId = planned.example.trip.id;
  const tool = setStayWeatherTool({ ...planned.fixture, tripId });
  return {
    ...planned,
    save: async (input: unknown) =>
      textOf(await tool.handler(tool.inputSchema.parse(input))),
    stored: async () => planned.fixture.reader.read(tripId),
  };
}

const TORREY_TEXT =
  "Cold nights, near freezing by late-night stargazing at Panorama Point. Bring a warm jacket, a hat, and gloves.";

describe("set_stay_weather", () => {
  it("saves the stay's text, labeled by its dates, with the activities it was written for", async () => {
    const trip = await moabWeather();
    const { torrey, stops } = trip.example;
    const reply = await trip.save({ stayId: torrey.id, guidance: TORREY_TEXT });
    expect(reply).toBe(
      `Saved the weather and clothing text for Stay 2, Torrey (${torrey.id}), from seasonal averages.`,
    );
    const saved = present(
      (await trip.stored()).itinerary.stays.find(
        (stay) => stay.id === torrey.id,
      )?.weatherText,
    );
    expect(saved.guidance).toBe(TORREY_TEXT);
    expect(saved.label).toBe("seasonalAverages");
    expect(saved.writtenForActivities.map((each) => each.stopId)).toContain(
      stops.panoramaPoint.id,
    );
  });

  it("refuses empty text and a stop ID, and saves nothing", async () => {
    const trip = await moabWeather();
    const { torrey, stops } = trip.example;
    expect(await trip.save({ stayId: torrey.id, guidance: "  " })).toBe(
      "Nothing was changed. A weather text's guidance can't be empty.",
    );
    expect(
      await trip.save({
        stayId: stops.panoramaPoint.id,
        guidance: TORREY_TEXT,
      }),
    ).toBe(
      `Nothing was changed. ${stops.panoramaPoint.id} is a stop ID, not a stay ID.`,
    );
    const stays = (await trip.stored()).itinerary.stays;
    expect(stays.every((stay) => stay.weatherText === null)).toBe(true);
  });
});
