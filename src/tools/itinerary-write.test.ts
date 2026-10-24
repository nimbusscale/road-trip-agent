import { describe, expect, it } from "vitest";

import { placeNamed } from "../domain/example-trip-parts.fake.js";
import { present, userOffer } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { itineraryWriteReply } from "./itinerary-write.js";
import { storeTrip, textOf } from "./stored-trip.fake.js";

describe("itineraryWriteReply", () => {
  // No tool selects a hotel yet. The change here does what one would.
  it("doesn't list a day as moved when only its stay's hotel changed", async () => {
    const fixture = setUp();
    const example = moabExample();
    await storeTrip(fixture, example.trip);
    const [inn] = await fixture.store.places.addPlaces(example.trip.id, [
      placeNamed("Moab Inn"),
    ]);
    const reply = textOf(
      await itineraryWriteReply(
        { ...fixture, tripId: example.trip.id },
        ({ trip, services, placeOf }) => {
          const moab = present(trip.itinerary.stays[0]);
          const place = placeOf(present(inn).id);
          services.stays.addLodgingCandidates(trip.itinerary, moab, [
            userOffer(place),
          ]);
          moab.selectCandidate(place);
          return { lines: ["Selected the Moab Inn."], touchedIds: [moab.id] };
        },
      ),
    );
    expect(reply).toContain("Selected the Moab Inn.");
    expect(reply).not.toContain("now runs");
    expect(reply).toContain("Road time changed");
  });
});
