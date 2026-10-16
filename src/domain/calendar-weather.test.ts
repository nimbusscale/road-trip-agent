import { describe, expect, it } from "vitest";

import type { Calendar } from "./calendar.js";
import { at, attraction, placeNamed } from "./example-trip-parts.fake.js";
import type { Itinerary } from "./itinerary.js";
import { present } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import type { Stay } from "./stay.js";
import { VIA_SERVICE } from "./via-service.js";
import type { WeatherLabel } from "./weather-label.js";
import { ActivityRecord, WeatherText } from "./weather-text.js";

// Writes the stay's weather text for the stay as it is now, as
// StaysService.setWeatherText() will.
function writeWeather(
  calendar: Calendar,
  itinerary: Itinerary,
  stay: Stay,
  label: WeatherLabel,
): void {
  stay[VIA_SERVICE].setWeatherText(
    new WeatherText({
      guidance: "Cool mornings, warm afternoons.",
      label,
      writtenOnDate: present(calendar.today(itinerary)),
      writtenForPlace: stay.place,
      writtenForDates: calendar.datesOf(itinerary, stay),
      writtenForActivities: calendar.activitiesOf(itinerary, stay).map(
        (stop) =>
          new ActivityRecord({
            stopId: stop.id,
            selectedPlace: stop.selectedPlace,
          }),
      ),
    }),
  );
}

function purposesOf(calendar: Calendar, itinerary: Itinerary, stay: Stay) {
  return calendar.activitiesOf(itinerary, stay).map((stop) => stop.purpose);
}

describe("a stay's activities", () => {
  it("include Panorama Point for Torrey", () => {
    const { trip, calendar, torrey, stops } = moabExample();
    const activities = calendar.activitiesOf(trip.itinerary, torrey);
    expect(activities).toContain(stops.panoramaPoint);
    expect(purposesOf(calendar, trip.itinerary, torrey)).toEqual([
      "hoodoos",
      "a canyon walk",
      "stargazing",
    ]);
  });

  it("cover attractions near the stay, and along the leg on its days, but no meals", () => {
    const { trip, calendar, moab } = moabExample();
    expect(purposesOf(calendar, trip.itinerary, moab)).toEqual([
      "towers",
      "a sunrise hike",
      "arches",
      "a hike",
    ]);
  });

  it("cover attractions near the start place for the first stay, and near the end place or along the last leg for the last stay", () => {
    const { trip, calendar, moab, torrey } = moabExample();
    const itinerary = trip.itinerary;
    const byTheStart = attraction({
      purpose: "riverfront walk",
      searchArea: "nearStartPlace",
    });
    present(moab.days[0])[VIA_SERVICE].placeStops([byTheStart], null);
    const onTheWayHome = attraction({
      purpose: "a ghost town",
      searchArea: "alongLeg",
    });
    const atTheEnd = attraction({
      purpose: "the temple grounds",
      searchArea: "nearEndPlace",
    });
    itinerary.lastDay[VIA_SERVICE].placeStops([onTheWayHome, atTheEnd], null);
    expect(calendar.activitiesOf(itinerary, moab)).toContain(byTheStart);
    expect(calendar.activitiesOf(itinerary, torrey)).toEqual(
      expect.arrayContaining([onTheWayHome, atTheEnd]),
    );
    expect(calendar.activitiesOf(itinerary, moab)).not.toContain(atTheEnd);
  });
});

describe("whether a stay's weather text is out of date", () => {
  it("is false while no stay has weather text", () => {
    const { trip, calendar, moab } = moabExample();
    expect(calendar.isWeatherOutOfDate(trip.itinerary, moab)).toBe(false);
  });

  it("is false for text that matches the stay, and true for a stay with none once another has some", () => {
    const { trip, calendar, moab, torrey } = moabExample();
    writeWeather(calendar, trip.itinerary, moab, "seasonalAverages");
    expect(calendar.isWeatherOutOfDate(trip.itinerary, moab)).toBe(false);
    expect(calendar.isWeatherOutOfDate(trip.itinerary, torrey)).toBe(true);
  });

  it("is true once the stay moves to another town", () => {
    const { trip, calendar, moab } = moabExample();
    writeWeather(calendar, trip.itinerary, moab, "seasonalAverages");
    moab.place = placeNamed("Green River");
    expect(calendar.isWeatherOutOfDate(trip.itinerary, moab)).toBe(true);
  });

  it("is true once an activity is added, or its place changes", () => {
    const added = moabExample();
    writeWeather(added.calendar, added.trip.itinerary, added.moab, "forecast");
    const sunset = attraction({
      purpose: "sunset",
      searchArea: "nearStay",
      stay: added.moab,
      setTime: at("18:00"),
    });
    present(added.moab.days[2])[VIA_SERVICE].placeStops([sunset], null);
    expect(
      added.calendar.isWeatherOutOfDate(added.trip.itinerary, added.moab),
    ).toBe(true);

    const cleared = moabExample();
    const { calendar, trip, moab, stops } = cleared;
    writeWeather(calendar, trip.itinerary, moab, "forecast");
    const towers = present(stops.fisherTowers.selectedPlace);
    stops.fisherTowers[VIA_SERVICE].removeCandidate(towers);
    expect(calendar.isWeatherOutOfDate(trip.itinerary, moab)).toBe(true);
  });

  it("is true for a forecast with any change to the dates", () => {
    const { trip, calendar, moab } = moabExample();
    writeWeather(calendar, trip.itinerary, moab, "forecast");
    const later = present(trip.itinerary.startDate).plusDays(1);
    trip.itinerary[VIA_SERVICE].setStartDate(later);
    expect(calendar.isWeatherOutOfDate(trip.itinerary, moab)).toBe(true);
  });

  it("is true for seasonal averages only once a date leaves the 7 days on each side", () => {
    const { trip, calendar, moab } = moabExample();
    const itinerary = trip.itinerary;
    writeWeather(calendar, itinerary, moab, "seasonalAverages");
    const written = present(itinerary.startDate);
    itinerary[VIA_SERVICE].setStartDate(written.plusDays(2));
    expect(calendar.isWeatherOutOfDate(itinerary, moab)).toBe(false);
    // The last night moves to October 20, the last written date plus 7 days.
    itinerary[VIA_SERVICE].setStartDate(written.plusDays(7));
    expect(calendar.isWeatherOutOfDate(itinerary, moab)).toBe(false);
    itinerary[VIA_SERVICE].setStartDate(written.plusDays(8));
    expect(calendar.isWeatherOutOfDate(itinerary, moab)).toBe(true);
    itinerary[VIA_SERVICE].setStartDate(written.plusDays(-8));
    expect(calendar.isWeatherOutOfDate(itinerary, moab)).toBe(true);
  });
});
