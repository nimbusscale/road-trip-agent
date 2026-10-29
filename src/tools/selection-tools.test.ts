import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import { exampleAddress } from "../domain/place.fake.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { plannedMoab, toolsFor } from "./skeleton-tools.fake.js";
import { storeTrip, textOf } from "./stored-trip.fake.js";

// select_candidate, select_user_place, and reject_places, over the Moab example as
// planned (domain model 5.2), in the fake store.

describe("select_user_place", () => {
  it("selects a place that's a candidate on another stop and a stay, and names each of them", async () => {
    const { selectUserPlace, read, example } = await plannedMoab();
    const hotel = present(example.moab.lodging);
    const brewery = present(example.moab.days[0]?.stops[2]);
    const dinner = present(example.moab.days[2]?.stops[0]);
    const first = textOf(
      await selectUserPlace({
        stopOrStayId: brewery.id,
        placeId: hotel.id,
        name: "Moab hotel",
        reason: "the bar at our hotel",
      }),
    );
    expect(first).toContain(
      `Selected Moab hotel for Day 1, Stop 3 (${brewery.id}), meal: "local beer", with a visit time of 1 h.`,
    );
    expect(first).toContain(
      `Moab hotel is also a lodging candidate for Stay 1, Moab (${example.moab.id}).`,
    );
    const second = await selectUserPlace({
      stopOrStayId: dinner.id,
      placeId: hotel.id,
      name: "Moab hotel",
      reason: "the user asked for it",
    });
    expect(second.isError).toBeUndefined();
    const text = textOf(second);
    expect(text).toContain(
      `Moab hotel is also a lodging candidate for Stay 1, Moab (${example.moab.id}).`,
    );
    expect(text).toContain(
      `Moab hotel is also a candidate for Day 1, Stop 3 (${brewery.id}), meal: "local beer".`,
    );
    const stop = await read(dinner.id);
    expect(stop).toContain("Selected: Moab hotel");
    expect(stop).toMatch(
      /- Set 2: Moab hotel \(place_\w+\), .*, selected\. Why: "the user asked for it" Named by the user\./,
    );
  });

  it("gives an attraction the user's visit time, and names a place Google has no name for", async () => {
    const fixture = setUp();
    const example = moabExample();
    await storeTrip(fixture, example.trip);
    const [house] = await fixture.store.places.addPlaces(example.trip.id, [
      exampleAddress(),
    ]);
    const tools = toolsFor({ ...fixture, tripId: example.trip.id });
    const towers = example.stops.fisherTowers;
    const reply = textOf(
      await tools.selectUserPlace({
        stopOrStayId: towers.id,
        placeId: present(house).id,
        name: "Mike's house",
        reason: "a friend's place on the way",
        visitTimeInMinutes: 90,
      }),
    );
    expect(reply).toMatch(
      /^Selected Mike's house for Day 1, Stop 2 \(stop_\w+\), attraction: "towers", with a visit time of 1 h 30 m\./,
    );
    expect(reply).not.toContain("Kept the name");
    expect(reply).not.toContain("is also");
  });

  it("refuses a place that's already a candidate there, a rejected place, and a visit time that doesn't fit the stop", async () => {
    const { selectUserPlace, rejectPlaces, example } = await plannedMoab();
    const milts = example.stops.milts;
    const miltsPlace = present(milts.selectedPlace);
    const call = (stopOrStayId: string, visitTimeInMinutes?: number) =>
      selectUserPlace({
        stopOrStayId,
        placeId: miltsPlace.id,
        name: "Milt's",
        reason: "burgers",
        ...(visitTimeInMinutes === undefined ? {} : { visitTimeInMinutes }),
      });
    expect(textOf(await call(milts.id))).toBe(
      `Nothing was changed. Milt's is already a candidate for Day 2, Stop 4 (${milts.id}), meal: "burgers". Select it with select_candidate.`,
    );
    expect(textOf(await call(example.stops.fisherTowers.id))).toBe(
      "Nothing was changed. An attraction stop needs visitTimeInMinutes: how long the user plans to spend there.",
    );
    expect(textOf(await call(example.stops.gifford.id, 60))).toMatch(
      /^Nothing was changed\. A meal stop takes no visitTimeInMinutes\./,
    );
    await rejectPlaces({
      rejections: [{ placeId: miltsPlace.id, reason: "too greasy" }],
    });
    expect(textOf(await call(example.stops.gifford.id))).toBe(
      `Nothing was changed. The user rejected Milt's for this trip, because "too greasy". A rejection can't be taken back.`,
    );
  });

  it("refuses a check-in, with or without a visit time, and says to select the hotel for the stay", async () => {
    const { addStops, selectUserPlace, example } = await plannedMoab();
    const day4 = present(example.torrey.days[0]);
    const added = textOf(
      await addStops({
        dayId: day4.id,
        after: "first",
        stops: [{ kind: "checkIn", purpose: "check in", setTime: "none" }],
      }),
    );
    const checkInId = present(/\((stop_\w+)\), checkIn/.exec(added))[1] ?? "";
    const hotel = present(example.torrey.lodging);
    for (const visitTimeInMinutes of [120, undefined]) {
      const reply = await selectUserPlace({
        stopOrStayId: checkInId,
        placeId: hotel.id,
        name: "Torrey hotel",
        reason: "we're staying there",
        visitTimeInMinutes,
      });
      expect(textOf(reply)).toBe(
        "Nothing was changed. A check-in has no candidates. Its place is where the party sleeps that night. To pick the hotel, select it for the stay instead.",
      );
    }
  });
});

describe("select_candidate", () => {
  it("refuses a check-in with the reason, and says to select the hotel for the stay", async () => {
    const { addStops, selectCandidate, example } = await plannedMoab();
    const day4 = present(example.torrey.days[0]);
    const added = textOf(
      await addStops({
        dayId: day4.id,
        after: "first",
        stops: [{ kind: "checkIn", purpose: "check in", setTime: "none" }],
      }),
    );
    const checkInId = present(/\((stop_\w+)\), checkIn/.exec(added))[1] ?? "";
    const reply = await selectCandidate({
      stopOrStayId: checkInId,
      placeId: present(example.torrey.lodging).id,
    });
    expect(textOf(reply)).toBe(
      "Nothing was changed. A check-in has no candidates. Its place is where the party sleeps that night. To pick the hotel, select it for the stay instead.",
    );
  });

  it("selects an older lodging candidate, and names the lodging once", async () => {
    const { selectUserPlace, selectCandidate, example } = await plannedMoab();
    const moabHotel = present(example.moab.lodging);
    await selectUserPlace({
      stopOrStayId: example.moab.id,
      placeId: present(example.torrey.lodging).id,
      name: "Torrey hotel",
      reason: "the user asked for it",
    });
    expect(
      textOf(
        await selectCandidate({
          stopOrStayId: example.moab.id,
          placeId: moabHotel.id,
        }),
      ),
    ).toContain(
      `Selected Moab hotel as the lodging of Stay 1, Moab (${example.moab.id}).`,
    );
  });

  it("selects an older candidate, and refuses a place that isn't one", async () => {
    const { selectUserPlace, selectCandidate, example } = await plannedMoab();
    const dinner = present(example.moab.days[2]?.stops[0]);
    const spoke = present(dinner.selectedPlace);
    const bistro = present(example.moab.days[1]?.stops[5]?.selectedPlace);
    await selectUserPlace({
      stopOrStayId: dinner.id,
      placeId: bistro.id,
      name: "Desert Bistro",
      reason: "the user asked for it",
    });
    expect(
      textOf(
        await selectCandidate({ stopOrStayId: dinner.id, placeId: spoke.id }),
      ),
    ).toMatch(
      /^Selected The Spoke on Center for Day 3, Stop 1 \(stop_\w+\), meal: "dinner near the hotel", with a visit time of 1 h\./,
    );
    expect(
      textOf(
        await selectCandidate({ stopOrStayId: dinner.id, placeId: spoke.id }),
      ),
    ).toMatch(
      /^The Spoke on Center was already selected for Day 3, Stop 1 .*, so nothing changed\./,
    );
    const hotel = present(example.torrey.lodging);
    expect(
      textOf(
        await selectCandidate({ stopOrStayId: dinner.id, placeId: hotel.id }),
      ),
    ).toBe(
      `Nothing was changed. Torrey hotel isn't a candidate for Day 3, Stop 1 (${dinner.id}), meal: "dinner near the hotel". To select a place the user named, use select_user_place.`,
    );
    expect(
      textOf(
        await selectCandidate({
          stopOrStayId: "day_k7m2x9qa",
          placeId: hotel.id,
        }),
      ),
    ).toBe("Nothing was changed. day_k7m2x9qa isn't a stop or stay ID.");
  });
});

describe("reject_places", () => {
  it("rejects a selected place and a lodging, and lists each stop and stay that lost one", async () => {
    const { rejectPlaces, read, example } = await plannedMoab();
    const milts = example.stops.milts;
    const miltsPlace = present(milts.selectedPlace);
    const hotel = present(example.moab.lodging);
    const reply = textOf(
      await rejectPlaces({
        rejections: [
          { placeId: miltsPlace.id, reason: "too greasy" },
          { placeId: hotel.id, reason: "the stay moved to Bakersfield" },
        ],
      }),
    );
    expect(reply).toContain("Rejected Milt's for the whole trip.");
    expect(reply).toContain("Rejected Moab hotel for the whole trip.");
    expect(reply).toContain(
      `- The lodging of Stay 1, Moab (${example.moab.id}): lost Moab hotel, which was selected, so nothing is selected now.`,
    );
    expect(reply).toContain(
      `- Day 2, Stop 4 (${milts.id}), meal: "burgers": lost Milt's, which was selected, so nothing is selected now.`,
    );
    const whole = await read("all");
    expect(whole).toContain("Milt's");
    expect(whole).toContain("too greasy");
  });

  it("keeps the first reason, and says when no stop or stay had the place", async () => {
    const { rejectPlaces, example } = await plannedMoab();
    const place = present(example.stops.milts.selectedPlace);
    await rejectPlaces({
      rejections: [{ placeId: place.id, reason: "too greasy" }],
    });
    const again = textOf(
      await rejectPlaces({
        rejections: [{ placeId: place.id, reason: "closed" }],
      }),
    );
    expect(again).toContain(
      `Milt's was already rejected, and keeps its first reason: "too greasy".`,
    );
    expect(again).toContain("No stop or stay had it as a candidate.");
    expect(
      textOf(
        await rejectPlaces({
          rejections: [
            { placeId: place.id, reason: "a" },
            { placeId: place.id, reason: "b" },
          ],
        }),
      ),
    ).toBe("Nothing was changed. Give each place once.");
  });
});
