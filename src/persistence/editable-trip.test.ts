import { describe, expect, it } from "vitest";

import { exampleMoabTrip } from "../domain/itinerary.fake.js";
import { exampleAddress, examplePlace } from "../domain/place.fake.js";
import { newTrip } from "../domain/trip.js";
import { EditableTrip } from "./editable-trip.js";
import { NoSuchPlaceError } from "./place-errors.js";
import { planSchema } from "./plan.schema.js";
import { planDocumentOf, tripFromRow } from "./plan-document.js";

const OWNER = { id: "4f6c1d0e-2a8b-4c3d-9e7f-1a2b3c4d5e6f" };

function editableWith(
  ...places: ReturnType<typeof examplePlace>[]
): EditableTrip {
  return new EditableTrip(newTrip(OWNER, new Date()), places);
}

describe("EditableTrip", () => {
  it("keeps the places that had no name when loaded", () => {
    const address = exampleAddress();
    const editable = editableWith(examplePlace(), address);
    expect(editable.unnamedPlaceIds).toEqual([address.id]);
  });

  it("gives the places whose name the write filled in, for the save", () => {
    const address = exampleAddress();
    const unused = exampleAddress();
    const editable = editableWith(examplePlace(), address, unused);
    expect(editable.namedPlaces).toEqual([]);
    editable.placeOf(address.id).fillName("Mike's house");
    expect(editable.namedPlaces).toEqual([address]);
  });

  it("refuses a place ID that isn't one of the trip's", () => {
    const editable = editableWith(examplePlace());
    expect(() => editable.placeOf("place_zzzzzzzz")).toThrow(NoSuchPlaceError);
  });

  it("keeps the start date and place as loaded, for the started-trip check", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const loadedStartPlace = trip.itinerary.startPlace;
    const editable = new EditableTrip(trip, places);
    trip.itinerary.startPlace = examplePlace();
    expect(editable.loadedStartPlace).toBe(loadedStartPlace);
    expect(editable.loadedStartDate?.toText()).toBe("2027-10-10");
    expect(editable.hasStarted()).toBe(false);
  });

  it("has started when the start date as loaded has come", () => {
    const { trip, places } = exampleMoabTrip(OWNER);
    const document = planDocumentOf(trip);
    document.itinerary.startDate = "2020-01-01";
    const plan = planSchema.parse(document);
    const started = tripFromRow(
      { id: trip.id, ownerId: OWNER.id, plan },
      places,
    );
    expect(new EditableTrip(started, places).hasStarted()).toBe(true);
    expect(started.hasStarted).toBe(true);
  });
});
