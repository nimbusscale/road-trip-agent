import { describe, expect, it } from "vitest";

import { placeNamed } from "./example-trip-parts.fake.js";
import { present, workerOffer } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { RejectedPlace } from "./rejected-place.js";

describe("RejectionsService.rejectPlaces", () => {
  it("clears the stay's lodging when the selected Moab hotel is rejected, and returns the Moab stay", () => {
    const { trip, services, moab, torrey } = moabExample();
    const itinerary = trip.itinerary;
    const hotel = present(moab.lodging);
    const result = services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: hotel, reason: "too far from town" }),
    ]);
    expect(result).toEqual({ stops: [], stays: [moab] });
    expect(moab.lodging).toBeNull();
    expect(moab.lodgingCandidates).toEqual([]);
    expect(moab.sleepsAt).toBe(moab.place);
    expect(torrey.lodging).not.toBeNull();
    expect(itinerary.isRejected(hotel)).toBe(true);
  });

  it("takes the place out of every stop's candidates, and clears a selection with its visit time", () => {
    const { trip, services, moab } = moabExample();
    const itinerary = trip.itinerary;
    const day2 = present(moab.days[1]);
    const [, windows, cafe] = day2.stops;
    const muffins = present(cafe?.selectedPlace);
    services.stops.addCandidates(itinerary, present(windows), [
      { ...workerOffer(muffins), tier: null, visitTimeInMinutes: 30 },
    ]);
    const result = services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: muffins, reason: "we had it last time" }),
    ]);
    expect(result.stays).toEqual([]);
    expect(result.stops).toEqual([windows, cafe]);
    expect(cafe?.selectedPlace).toBeNull();
    expect(cafe?.visitTimeInMinutes).toBeNull();
    expect(cafe?.status).toBe("empty");
    expect(windows?.selectedPlace?.name).toBe("Windows");
    expect(windows?.candidates.map((each) => each.place.name)).toEqual([
      "Windows",
    ]);
  });

  it("leaves the trip's structure alone, and keeps the place out of later candidates", () => {
    const { trip, services, moab } = moabExample();
    const itinerary = trip.itinerary;
    const result = services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: moab.place, reason: "too busy" }),
    ]);
    expect(result).toEqual({ stops: [], stays: [] });
    expect(itinerary.stays[0]).toBe(moab);
    expect(moab.place.name).toBe("Moab");
    expect(() => {
      services.stays.addLodgingCandidates(itinerary, moab, [
        workerOffer(moab.place),
      ]);
    }).toThrow("The user rejected Moab, so it can't be a candidate.");
  });

  it("keeps the first reason for a place already rejected", () => {
    const { trip, services } = moabExample();
    const itinerary = trip.itinerary;
    const motel = placeNamed("Kitschy motel");
    services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: motel, reason: "too kitschy for us" }),
    ]);
    services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: motel, reason: "changed our minds" }),
    ]);
    expect(itinerary.rejectedPlaces.map((each) => each.reason)).toEqual([
      "too kitschy for us",
    ]);
  });

  it("refuses a rejection with an empty reason, when it's created", () => {
    expect(
      () => new RejectedPlace({ place: placeNamed("Motel"), reason: " " }),
    ).toThrow("A rejected place needs the user's reason.");
  });
});
