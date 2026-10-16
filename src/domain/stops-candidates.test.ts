import { describe, expect, it } from "vitest";

import type { CandidateOffer } from "./candidate.js";
import { meal, placeNamed } from "./example-trip-parts.fake.js";
import { present, userOffer, workerOffer } from "./itinerary.fake.js";
import { moabExample } from "./moab-example.fake.js";
import { RejectedPlace } from "./rejected-place.js";

// A Moab stop with no candidates yet: a meal near the Moab stay on Day 2.
function withEmptyMeal() {
  const example = moabExample();
  const itinerary = example.trip.itinerary;
  const day2 = present(example.moab.days[1]);
  const lunch = meal({
    purpose: "lunch",
    searchArea: "nearStay",
    stay: example.moab,
  });
  example.services.stops.addStops(itinerary, day2, [lunch], null);
  return { ...example, itinerary, lunch };
}

describe("StopsService.addCandidates", () => {
  it("adds one set, with the stop's tier for the ones a worker found", () => {
    const { itinerary, services, lunch } = withEmptyMeal();
    services.stops.addCandidates(itinerary, lunch, [
      workerOffer(placeNamed("Quesadilla Mobilla")),
      userOffer(placeNamed("Moab Food Truck Park")),
    ]);
    expect(lunch.status).toBe("proposed");
    expect(lunch.candidates.map((each) => [each.setNumber, each.tier])).toEqual(
      [
        [0, "value"],
        [0, null],
      ],
    );
  });

  it("refuses the whole set when a place is rejected", () => {
    const { itinerary, services, lunch } = withEmptyMeal();
    const rejected = placeNamed("Chain diner");
    services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: rejected, reason: "no chains" }),
    ]);
    expect(() => {
      services.stops.addCandidates(itinerary, lunch, [
        workerOffer(placeNamed("Quesadilla Mobilla")),
        workerOffer(rejected),
      ]);
    }).toThrow("The user rejected Chain diner, so it can't be a candidate.");
    expect(lunch.candidates).toEqual([]);
  });

  it("refuses by the stop's own rules: the set's size, a repeat, or a candidate that doesn't fit", () => {
    const { itinerary, services, lunch, stops } = withEmptyMeal();
    const add = (stop: typeof lunch, offers: CandidateOffer[]): void => {
      services.stops.addCandidates(itinerary, stop, offers);
    };
    const four = ["A", "B", "C", "D"].map((name) =>
      workerOffer(placeNamed(name)),
    );
    expect(() => {
      add(lunch, four);
    }).toThrow("A set of candidates holds 1 to 3.");
    const milts = present(stops.milts.selectedPlace);
    expect(() => {
      add(stops.milts, [workerOffer(milts)]);
    }).toThrow("Milt's is already one of the candidates.");
    expect(() => {
      add(lunch, [
        { ...workerOffer(placeNamed("Cafe")), visitTimeInMinutes: 45 },
      ]);
    }).toThrow(
      "an attraction's candidates each have a visit time, and a meal's have none.",
    );
    expect(() => {
      add(stops.gifford, [workerOffer(placeNamed("Pie stand"))]);
    }).toThrow(
      "a candidate has a detour time exactly when the stop is along the leg",
    );
    expect(lunch.candidates).toEqual([]);
  });
});

describe("StopsService.selectCandidate", () => {
  it("gives a meal the meal visit time, and the tier of the candidate the user picked", () => {
    const { itinerary, services, lunch } = withEmptyMeal();
    const posh = placeNamed("Desert Bistro");
    services.stops.addCandidates(itinerary, lunch, [workerOffer(posh)]);
    lunch.setTier("midRange", "the user asked for something nicer");
    services.stops.selectCandidate(lunch, posh);
    expect(lunch.selectedPlace).toBe(posh);
    expect(lunch.visitTimeInMinutes).toBe(60);
    expect(lunch.tier).toBe("value");
    expect(lunch.tierRule).toBe("the user picked a value option");
  });

  it("gives an attraction the candidate's visit time, and removes an opening hours approval", () => {
    const { trip, services, stops } = moabExample();
    const itinerary = trip.itinerary;
    services.stops.approveOpeningHours(itinerary, stops.milts, "we eat fast");
    const rays = placeNamed("Ray's Tavern");
    services.stops.addCandidates(itinerary, stops.milts, [userOffer(rays)]);
    services.stops.selectCandidate(stops.milts, rays);
    expect(stops.milts.approvals).toEqual([]);
    expect(stops.milts.tier).toBe("value");
    const sunset = placeNamed("Delicate Arch at sunset");
    services.stops.addCandidates(itinerary, stops.delicateArch, [
      { ...userOffer(sunset), visitTimeInMinutes: 200 },
    ]);
    services.stops.selectCandidate(stops.delicateArch, sunset);
    expect(stops.delicateArch.visitTimeInMinutes).toBe(200);
  });

  it("changes nothing when the place is already selected", () => {
    const { trip, services, stops } = moabExample();
    const milts = present(stops.milts.selectedPlace);
    services.stops.approveOpeningHours(
      trip.itinerary,
      stops.milts,
      "we eat fast",
    );
    stops.milts.visitTimeInMinutes = 45;
    services.stops.selectCandidate(stops.milts, milts);
    expect(stops.milts.visitTimeInMinutes).toBe(45);
    expect(stops.milts.approvals).toHaveLength(1);
  });

  it("refuses a place that isn't one of the stop's candidates", () => {
    const { services, stops } = moabExample();
    expect(() => {
      services.stops.selectCandidate(stops.milts, placeNamed("Ray's Tavern"));
    }).toThrow("Ray's Tavern isn't one of the stop's candidates.");
    expect(stops.milts.selectedPlace?.name).toBe("Milt's");
  });
});

describe("StopsService opening hours approvals", () => {
  it("records how many minutes of the visit fall within the opening hours", () => {
    const { trip, services, stops } = moabExample();
    services.stops.approveOpeningHours(
      trip.itinerary,
      stops.milts,
      "we eat fast",
    );
    services.stops.approveOpeningHours(
      trip.itinerary,
      stops.gifford,
      "we'll skip pie",
    );
    expect(stops.milts.approvals[0]?.approvedOpenTimeInMinutes).toBe(30);
    expect(stops.gifford.approvals[0]?.approvedOpenTimeInMinutes).toBe(0);
  });

  it("refuses a stop with no selected place, or whose place's hours aren't known", () => {
    const { itinerary, services, lunch, stops } = withEmptyMeal();
    expect(() => {
      services.stops.approveOpeningHours(itinerary, lunch, "fine");
    }).toThrow(
      "has no selected place with known opening hours, so there's no opening hours warning to approve.",
    );
    expect(() => {
      services.stops.approveOpeningHours(itinerary, stops.fisherTowers, "fine");
    }).toThrow(
      `towers (${stops.fisherTowers.id}) has no selected place with known opening hours`,
    );
  });

  it("refuses while the stop's visit times aren't known, and an empty reason", () => {
    const { trip, services, torrey, stops } = moabExample();
    const itinerary = trip.itinerary;
    const goblinValley = present(
      present(torrey.days[0]).stops[0]?.selectedPlace,
    );
    // Until the leg is routed again, the day's drive times aren't known.
    services.rejections.rejectPlaces(itinerary, [
      new RejectedPlace({ place: goblinValley, reason: "too hot" }),
    ]);
    expect(() => {
      services.stops.approveOpeningHours(itinerary, stops.gifford, "fine");
    }).toThrow("has no visit times yet");
    expect(() => {
      services.stops.approveOpeningHours(itinerary, stops.milts, " ");
    }).toThrow("An approval needs the user's reason.");
    expect(stops.milts.approvals).toEqual([]);
  });

  it("removes the stop's approval, and refuses a kind only days hold", () => {
    const { trip, services, stops } = moabExample();
    services.stops.approveOpeningHours(
      trip.itinerary,
      stops.milts,
      "we eat fast",
    );
    services.stops.removeApproval(stops.milts, "openingHours");
    expect(stops.milts.approvals).toEqual([]);
    expect(() => {
      services.stops.removeApproval(stops.milts, "driveHours");
    }).toThrow("A stop holds no driveHours approval. Only days hold them.");
  });
});
