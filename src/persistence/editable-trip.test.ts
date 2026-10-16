import { describe, expect, it } from "vitest";

import { exampleAddress, examplePlace } from "../domain/place.fake.js";
import { newTrip } from "../domain/trip.js";
import { EditableTrip } from "./editable-trip.js";
import { NoSuchPlaceError } from "./place-errors.js";

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
});
