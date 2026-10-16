import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { examplePlace } from "../domain/place.fake.js";
import { setUp } from "./trip-writer.fake.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

// A trip whose brief asks for 3 days, while its itinerary has only the last day, so the
// checks give a trip length warning.
async function shortTrip(): Promise<ReturnType<typeof setUp> & { id: string }> {
  const fixture = setUp();
  const { id } = await fixture.writer.startTrip(OWNER);
  const [start, end] = await fixture.store.places.addPlaces(id, [
    examplePlace({ name: "San Francisco", googlePlaceId: "google-sf" }),
    examplePlace({ name: "Mike's house", googlePlaceId: "google-la" }),
  ]);
  await fixture.writer.write(id, "worker", ({ trip, services, placeOf }) => {
    trip.itinerary.startPlace = placeOf(start?.id ?? "");
    trip.itinerary.endPlace = placeOf(end?.id ?? "");
    services.itinerary.setStartDate(
      trip.itinerary,
      new CalendarDate(2027, 5, 13),
    );
    services.tripBrief.setTripLength(trip.tripBrief, 3);
  });
  return { ...fixture, id };
}

describe("TripWriter.write's checks", () => {
  it("runs the checks after a coordinator write, hands back the comparison, and saves the list", async () => {
    const { writer, reader, id } = await shortTrip();
    const first = await writer.write(id, "coordinator", () => undefined);
    expect(
      first.checkComparison?.newResults.map((result) => result.check),
    ).toEqual(["tripLengthVsBrief"]);
    const saved = (await reader.read(id)).itinerary.checkResults;
    expect(saved.map((result) => result.text)).toEqual([
      "The trip is 1 day, and the brief asks for 3.",
    ]);
    const second = await writer.write(id, "coordinator", ({ trip }) => {
      trip.tripBrief.focus = "Pacific Coast Highway";
    });
    expect(second.checkComparison?.newResults).toEqual([]);
    expect(
      second.checkComparison?.knownResults.map((result) => result.check),
    ).toEqual(["tripLengthVsBrief"]);
  });

  it("runs no checks after a worker write, and leaves the saved list alone", async () => {
    const { writer, reader, id } = await shortTrip();
    await writer.write(id, "coordinator", () => undefined);
    const result = await writer.write(id, "worker", ({ trip, services }) => {
      services.tripBrief.setTripLength(trip.tripBrief, 1);
    });
    expect(result.checkComparison).toBeNull();
    const saved = (await reader.read(id)).itinerary.checkResults;
    expect(saved.map((each) => each.check)).toEqual(["tripLengthVsBrief"]);
  });
});
