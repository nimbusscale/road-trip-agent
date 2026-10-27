import { describe, expect, it } from "vitest";

import { PLANNED_AT, placeNamed } from "../domain/example-trip-parts.fake.js";
import { workerOffer } from "../domain/itinerary.fake.js";
import { moabExample } from "../domain/moab-example.fake.js";
import type { Trip } from "../domain/trip.js";
import { setUp } from "../persistence/trip-writer.fake.js";
import { readItineraryTool } from "../tools/itinerary-tools.js";
import { storeTrip, textOf } from "../tools/stored-trip.fake.js";
import { readTripBriefTool } from "../tools/trip-brief-tools.js";
import { type PlanDetail, planTextOf } from "./plan-downloads.js";

// The downloads against what the coordinator's own reads return for the same trip
// (functional spec 10.1).

interface Downloads {
  download: (detail: PlanDetail) => Promise<string>;
  read: (scope: string) => Promise<string>;
  readBrief: () => Promise<string>;
  storedPlan: () => string | undefined;
}

async function downloadsOf(trip: Trip): Promise<Downloads> {
  const fixture = setUp();
  await storeTrip(fixture, trip);
  const session = { ...fixture, tripId: trip.id, now: () => PLANNED_AT };
  const readTool = readItineraryTool(session);
  const briefTool = readTripBriefTool(session);
  return {
    download: async (detail) =>
      planTextOf(
        await fixture.reader.read(trip.id),
        fixture.settings,
        session.now,
        detail,
      ),
    read: async (scope) => textOf(await readTool.handler({ scope })),
    readBrief: async () => textOf(await briefTool.handler({})),
    storedPlan: () => fixture.store.rows.get(trip.id)?.plan,
  };
}

// The part of a stay read that a full plan gives too: the stay and its days, without
// the stops on other days and the check results that close the read.
function stayAndDaysOf(stayRead: string): string {
  const ends = ["\n\nStops on other days", "\n\nCheck results"]
    .map((end) => stayRead.indexOf(end))
    .filter((index) => index !== -1);
  return stayRead.slice(0, Math.min(...ends));
}

describe("the plan's downloads", () => {
  it("gives the trip brief as read_trip_brief does, then the itinerary as a whole read does", async () => {
    const { trip } = moabExample();
    const downloads = await downloadsOf(trip);
    const brief = await downloads.readBrief();
    const whole = await downloads.read("all");
    expect(whole).toContain("Check results:\n- New");
    expect(await downloads.download("slim")).toBe(`${brief}\n\n${whole}\n`);
  });

  it("gives each stay and its days in the full plan as a read of that stay does", async () => {
    const { trip, moab, torrey } = moabExample();
    const downloads = await downloadsOf(trip);
    const full = await downloads.download("full");
    expect(full).toMatch(/^focus: /);
    for (const stay of [moab, torrey]) {
      const part = stayAndDaysOf(await downloads.read(stay.id));
      expect(part).toContain('Why: "');
      expect(full).toContain(`\n\n${part}\n\n`);
    }
  });

  it("has no size limit, unlike a read", async () => {
    const { trip, services, moab } = moabExample();
    // Sets of 3, the most a set holds.
    for (const set of [...Array(20).keys()]) {
      services.stays.addLodgingCandidates(
        trip.itinerary,
        moab,
        [1, 2, 3].map((each) => ({
          ...workerOffer(placeNamed(`Moab inn ${String(set)}-${String(each)}`)),
          rationale: "Close to the park, with a pool. ".repeat(25),
        })),
      );
    }
    const downloads = await downloadsOf(trip);
    expect(await downloads.read(moab.id)).toMatch(/too large to return/);
    expect((await downloads.download("full")).length).toBeGreaterThan(40_000);
  });

  it("saves nothing, so the check results stay new", async () => {
    const { trip } = moabExample();
    const downloads = await downloadsOf(trip);
    const stored = downloads.storedPlan();
    expect(stored).toContain('"checkResults":[]');
    const first = await downloads.download("slim");
    await downloads.download("full");
    expect(downloads.storedPlan()).toBe(stored);
    expect(await downloads.download("slim")).toBe(first);
    expect(first).toContain("- New");
  });
});
