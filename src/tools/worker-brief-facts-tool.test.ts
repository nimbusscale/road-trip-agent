import { describe, expect, it } from "vitest";

import { present } from "../domain/itinerary.fake.js";
import { plannedMoab } from "./skeleton-tools.fake.js";
import { textOf } from "./stored-trip.fake.js";
import { readWorkerBriefFactsTool } from "./worker-brief-facts-tool.js";

// read_worker_brief_facts over the Moab example as planned (domain model 5.2), in the
// fake store. Every stop and stay there has one candidate, the place selected for it.

async function moabFacts(): Promise<
  Awaited<ReturnType<typeof plannedMoab>> & {
    facts: (stopOrStayIds: string[]) => Promise<string>;
    isError: (stopOrStayIds: string[]) => Promise<boolean | undefined>;
  }
> {
  const planned = await plannedMoab();
  const tool = readWorkerBriefFactsTool({
    ...planned.fixture,
    tripId: planned.example.trip.id,
  });
  const call = (stopOrStayIds: string[]) =>
    tool.handler(tool.inputSchema.parse({ stopOrStayIds }));
  return {
    ...planned,
    facts: async (ids) => textOf(await call(ids)),
    isError: async (ids) => (await call(ids)).isError,
  };
}

const PLACE = String.raw`\(place_\w+\)`;

describe("read_worker_brief_facts", () => {
  it("gives a stay's town, nights and dates, lodging candidates already offered, and activities", async () => {
    const { facts, example } = await moabFacts();
    const { moab } = example;
    const lines = (await facts([moab.id])).split("\n");
    expect(lines[0]).toMatch(
      new RegExp(
        String.raw`^Stay 1 \(${moab.id}\): Moab ${PLACE}, .+\. 3 nights, Days 1 to 3, from Sunday, October 10, 2027 to the morning of Wednesday, October 13, 2027\.$`,
      ),
    );
    expect(lines.slice(1)).toEqual([
      "- Lodging candidates already offered:",
      expect.stringMatching(
        new RegExp(
          String.raw`^  - Set 1: Moab hotel ${PLACE}, .+, selected\.$`,
        ),
      ),
      "- The stay's activities:",
      expect.stringMatching(
        new RegExp(
          String.raw`^  - Fisher Towers viewpoint ${PLACE}, .+: Sunday, October 10, 2027, \d+:\d\d a\.m\. to \d+:\d\d p\.m\.$`,
        ),
      ),
      expect.stringMatching(
        new RegExp(
          String.raw`^  - Delicate Arch trail ${PLACE}, .+: Monday, October 11, 2027, 6:00 a\.m\. to 8:40 a\.m\.$`,
        ),
      ),
      expect.stringMatching(/^ {2}- Windows /),
      expect.stringMatching(/^ {2}- Corona Arch /),
    ]);
  });

  it("gives an activity after midnight on the date it falls on, and the stops along the stay's legs", async () => {
    const { facts, example } = await moabFacts();
    const text = await facts([example.torrey.id]);
    expect(text).toMatch(
      new RegExp(
        String.raw`  - Goblin Valley State Park ${PLACE}, .+: Wednesday, October 13, 2027, 9:55 a\.m\. to 11:55 a\.m\.\n  - Capitol Gorge `,
      ),
    );
    expect(text).toMatch(
      new RegExp(
        String.raw`  - Panorama Point ${PLACE}, .+: Thursday, October 14, 2027, 1:00 a\.m\. to 2:00 a\.m\.$`,
      ),
    );
  });

  it("gives a stop's day, its facts and candidates, and the day's stops, with two stops on one day under one day", async () => {
    const { facts, example } = await moabFacts();
    const { gifford, panoramaPoint } = example.stops;
    const day4 = present(example.torrey.days[0]);
    const lines = (await facts([panoramaPoint.id, gifford.id])).split("\n");
    expect(lines.slice(0, 9)).toEqual([
      `Day 4 (${day4.id}), Wednesday, October 13, 2027: Moab → Torrey. Starts 8:00 a.m., the usual start time.`,
      "Stops asked for:",
      `- Stop 2 (${gifford.id}), meal: "pie". Along the leg. Set time: none.`,
      "  - Candidates already offered:",
      expect.stringMatching(
        new RegExp(
          String.raw`^    - Set 1: Gifford Homestead ${PLACE}, .+, selected\.$`,
        ),
      ),
      `- Stop 4 (${panoramaPoint.id}), attraction: "stargazing". Near the Torrey stay. Set time: 1:00 a.m. the next day.`,
      "  - Candidates already offered:",
      expect.stringMatching(/^ {4}- Set 1: Panorama Point /),
      "The day's stops, in order:",
    ]);
    expect(lines.slice(9)).toEqual([
      expect.stringMatching(
        new RegExp(
          String.raw`^- 9:55 a\.m\. to 11:55 a\.m\.: Stop 1 \(stop_\w+\), attraction: "hoodoos"\. Along the leg\. Selected: Goblin Valley State Park ${PLACE}, .+, visit time 2 h\.$`,
        ),
      ),
      expect.stringMatching(
        /^- 1:20 p\.m\. to 2:20 p\.m\.: Stop 2 .+ Selected: Gifford Homestead /,
      ),
      expect.stringMatching(/^- 2:40 p\.m\. to 4:40 p\.m\.: Stop 3 /),
      expect.stringMatching(
        /^- 1:00 a\.m\. the next day to 2:00 a\.m\. the next day: Stop 4 /,
      ),
    ]);
  });

  it("gives stays and days in the order asked, each once", async () => {
    const { facts, example } = await moabFacts();
    const text = await facts([
      example.stops.milts.id,
      example.torrey.id,
      example.stops.delicateArch.id,
      example.torrey.id,
    ]);
    const headers = text.split("\n\n").map((section) => section.split(" (")[0]);
    expect(headers).toEqual(["Day 2", "Stay 2"]);
    expect(text).toMatch(
      /Stops asked for:\n- Stop 1 \(stop_\w+\), attraction: "a sunrise hike"\. Near the Moab stay\. Set time: 6:00 a\.m\.\n[^]*- Stop 4 \(stop_\w+\), meal: "burgers"/,
    );
  });

  it("says when nothing has been offered yet", async () => {
    const { facts, addStops, example } = await moabFacts();
    const day3 = present(example.moab.days[2]);
    const added = textOf(
      await addStops({
        dayId: day3.id,
        after: "first",
        stops: [
          {
            kind: "meal",
            purpose: "breakfast",
            searchArea: example.moab.id,
            setTime: "8:00 a.m.",
          },
        ],
      }),
    );
    const stopId = present(/\((stop_\w+)\), meal/.exec(added))[1] ?? "";
    expect(await facts([stopId])).toContain(
      `- Stop 1 (${stopId}), meal: "breakfast". Near the Moab stay. Set time: 8:00 a.m.\n  - Candidates already offered: none.\n`,
    );
  });

  it("refuses a check-in, an ID of the wrong kind, and an ID the trip doesn't have", async () => {
    const { facts, isError, addStops, example } = await moabFacts();
    const day4 = present(example.torrey.days[0]);
    const added = textOf(
      await addStops({
        dayId: day4.id,
        after: "first",
        stops: [{ kind: "checkIn", purpose: "check in", setTime: "none" }],
      }),
    );
    const checkInId = present(/\((stop_\w+)\), checkIn/.exec(added))[1] ?? "";
    expect(await facts([example.moab.id, checkInId])).toBe(
      `${checkInId} is a check-in. A check-in has no candidates, so no worker fills it.`,
    );
    expect(await isError([checkInId])).toBe(true);
    expect(await facts([day4.id])).toBe(`${day4.id} isn't a stop or stay ID.`);
    expect(await facts([example.moab.id, "stop_zzzzzzzz"])).toBe(
      "This trip has no stop stop_zzzzzzzz.",
    );
    expect(await isError(["stay_zzzzzzzz"])).toBe(true);
  });

  it("refuses an empty list", async () => {
    const { fixture, example } = await moabFacts();
    const tool = readWorkerBriefFactsTool({
      ...fixture,
      tripId: example.trip.id,
    });
    expect(tool.inputSchema.safeParse({ stopOrStayIds: [] }).success).toBe(
      false,
    );
  });
});
