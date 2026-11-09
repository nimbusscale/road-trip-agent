import { describe, expect, it } from "vitest";

import {
  GoogleRoutesError,
  NoDrivingRouteError,
} from "../google/routes-client.js";
import { found, moabWithPlaces } from "./candidate-tools.fake.js";
import { textOf } from "./stored-trip.fake.js";

// add_meal_candidates on Day 4, Stop 2, a stop along the leg, when Google finds no
// driving route through some of the places (#266). Each test place's Google place ID is
// made from its name (placeNamed()).

async function mealStopWhereNoRouteTo(
  names: readonly string[],
  unroutable: readonly string[],
) {
  const trip = await moabWithPlaces(names);
  trip.fixture.routeFinder.failureFor = (path) =>
    path.through.some((point) =>
      unroutable.some((name) => point.place.googlePlaceId === `google-${name}`),
    )
      ? new NoDrivingRouteError("Google found no driving route.")
      : null;
  const { gifford } = trip.example.stops;
  const reply = await trip.addMeal({
    stopId: gifford.id,
    candidates: names.map((name) => ({
      ...found(trip.placeId(name)),
      tier: "value",
    })),
  });
  const named = (name: string) => `${name} (${trip.placeId(name)})`;
  return { reply, named, read: await trip.read(gifford.id) };
}

describe("add_meal_candidates when Google finds no route to a place", () => {
  it("refuses the set, naming the place, and says the others have routes", async () => {
    const { reply, named, read } = await mealStopWhereNoRouteTo(
      ["Pie shop", "Bakery", "Diner"],
      ["Bakery"],
    );
    expect(reply.isError).toBe(true);
    expect(textOf(reply)).toBe(
      `Nothing was changed. Google found no driving route to ${named("Bakery")} on Day 4's drive, so it has no detour time. Google doesn't say why, but often the place's pin isn't on a road. The other candidates have routes. Add the set again without it, or with another place in its place.`,
    );
    expect(read).not.toContain("Set 2");
  });

  it("names both places when two have no route", async () => {
    const { reply, named } = await mealStopWhereNoRouteTo(
      ["Pie shop", "Bakery", "Diner"],
      ["Pie shop", "Diner"],
    );
    expect(textOf(reply)).toBe(
      `Nothing was changed. Google found no driving route to ${named("Pie shop")} or ${named("Diner")} on Day 4's drive, so they have no detour times. Google doesn't say why, but often a place's pin isn't on a road. The other candidate has a route. Add the set again without them, or with other places in their place.`,
    );
  });

  it("names every place when none has a route", async () => {
    const names = ["Pie shop", "Bakery", "Diner"];
    const { reply, named } = await mealStopWhereNoRouteTo(names, names);
    expect(textOf(reply)).toBe(
      `Nothing was changed. Google found no driving route to ${named("Pie shop")}, ${named("Bakery")}, or ${named("Diner")} on Day 4's drive, so they have no detour times. Google doesn't say why, but often a place's pin isn't on a road. Add the set again with other places.`,
    );
  });

  it("gives another failed call's error as it is", async () => {
    const trip = await moabWithPlaces(["Pie shop", "Bakery"]);
    trip.fixture.routeFinder.failureFor = (path) =>
      path.through.some(
        (point) => point.place.googlePlaceId === "google-Bakery",
      )
        ? new GoogleRoutesError("Google Routes couldn't be reached. Try again.")
        : null;
    const reply = await trip.addMeal({
      stopId: trip.example.stops.gifford.id,
      candidates: ["Pie shop", "Bakery"].map((name) => ({
        ...found(trip.placeId(name)),
        tier: "value",
      })),
    });
    expect(textOf(reply)).toBe(
      "Nothing was changed. Google Routes couldn't be reached. Try again.",
    );
  });
});
