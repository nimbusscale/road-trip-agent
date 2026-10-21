import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CalendarDate } from "../domain/calendar-date.js";
import { examplePlace } from "../domain/place.fake.js";
import { ArchiveClient, OpenMeteoError, USER_AGENT } from "./archive-client.js";

// Responses Open-Meteo gave on 2026-10-21 for Moab, October 3 to 20 of each year from
// 2016 to 2025: the Moab stay's dates, October 10 to 13, plus a week on each side. Kept
// by year.
const MOAB_OCTOBER: unknown = JSON.parse(
  readFileSync(
    new URL("saved-responses/moab-october-10-to-13.json", import.meta.url),
    "utf8",
  ),
);

// Open-Meteo's reply to a spent limit, as the Open-Meteo design (section 2.4) gives it.
// Spending a real limit to save one would mean hundreds of calls in a minute.
const SPENT_LIMIT = readFileSync(
  new URL("saved-responses/spent-limit.json", import.meta.url),
  "utf8",
);

const MOAB = examplePlace({
  name: "Moab",
  latitude: 38.5733,
  longitude: -109.5498,
});

const STAY_DATES = [10, 11, 12, 13].map(
  (day) => new CalendarDate(2027, 10, day),
);

const TODAY = new CalendarDate(2026, 10, 21);

// Answers each request with the saved response for the year it asks for.
function savedFetch(sent: URL[]): typeof fetch {
  return (url) => {
    const asked = new URL(typeof url === "string" ? url : "");
    sent.push(asked);
    const year = asked.searchParams.get("start_date")?.slice(0, 4) ?? "";
    const byYear = new Map(Object.entries(MOAB_OCTOBER ?? {}));
    return Promise.resolve(
      new Response(JSON.stringify(byYear.get(year) ?? {}), { status: 200 }),
    );
  };
}

describe("ArchiveClient.seasonalAverages", () => {
  it("asks once for each of the last 10 complete years, for the stay's dates plus a week on each side", async () => {
    const sent: URL[] = [];
    const client = new ArchiveClient({ fetch: savedFetch(sent) });
    await client.seasonalAverages(MOAB, STAY_DATES, TODAY);
    expect(
      sent.map(
        (url) =>
          `${url.searchParams.get("start_date") ?? ""} ${url.searchParams.get("end_date") ?? ""}`,
      ),
    ).toEqual(
      Array.from({ length: 10 }, (unused, index) => {
        const year = String(2016 + index);
        return `${year}-10-03 ${year}-10-20`;
      }),
    );
    expect([...(sent[0]?.searchParams ?? [])]).toEqual(
      expect.arrayContaining([
        ["latitude", "38.5733"],
        ["longitude", "-109.5498"],
        [
          "daily",
          "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum",
        ],
        ["temperature_unit", "fahrenheit"],
        ["precipitation_unit", "inch"],
        ["timezone", "auto"],
      ]),
    );
    expect(sent[0]?.searchParams.has("models")).toBe(false);
  });

  it("sends an identifying User-Agent", async () => {
    const headers: unknown[] = [];
    const client = new ArchiveClient({
      fetch: (url, init) => {
        headers.push(init?.headers);
        return savedFetch([])(url, init);
      },
    });
    await client.seasonalAverages(MOAB, STAY_DATES, TODAY);
    expect(headers[0]).toEqual({ "User-Agent": USER_AGENT });
  });

  it("sums up every day of every year into one set of averages and shares", async () => {
    const client = new ArchiveClient({ fetch: savedFetch([]) });
    const averages = await client.seasonalAverages(MOAB, STAY_DATES, TODAY);
    // Worked out apart from the app, from the 180 saved days.
    expect(averages).toEqual({
      firstYear: 2016,
      lastYear: 2025,
      averageHighInFahrenheit: 71,
      averageLowInFahrenheit: 47,
      rainDaysPercent: 14,
      snowDaysPercent: 0,
      daysAt90Percent: 1,
      daysAt100Percent: 0,
      freezingNightsPercent: 2,
      warmestInFahrenheit: 90,
      coldestInFahrenheit: 27,
    });
  });

  it("refuses with Open-Meteo's reason when a limit is spent", async () => {
    const client = new ArchiveClient({
      fetch: () => Promise.resolve(new Response(SPENT_LIMIT, { status: 429 })),
    });
    const averages = client.seasonalAverages(MOAB, STAY_DATES, TODAY);
    await expect(averages).rejects.toThrow(OpenMeteoError);
    await expect(averages).rejects.toThrow(
      'Seasonal averages are unavailable right now. Open-Meteo said: "Minutely API request limit exceeded. Please try again in one minute."',
    );
  });

  it("refuses a spent limit that comes with a good status", async () => {
    const client = new ArchiveClient({
      fetch: () => Promise.resolve(new Response(SPENT_LIMIT, { status: 200 })),
    });
    await expect(
      client.seasonalAverages(MOAB, STAY_DATES, TODAY),
    ).rejects.toThrow("Seasonal averages are unavailable right now.");
  });

  it("leaves out days with no data yet, and refuses when no day has any", async () => {
    // Open-Meteo's names, so it's written as JSON.
    const empty =
      '{"daily":{"time":["2025-10-03"],"temperature_2m_max":[null],"temperature_2m_min":[null],"precipitation_sum":[null],"snowfall_sum":[null]}}';
    const client = new ArchiveClient({
      fetch: () => Promise.resolve(new Response(empty)),
    });
    await expect(
      client.seasonalAverages(MOAB, STAY_DATES, TODAY),
    ).rejects.toThrow(
      "Open-Meteo has no past weather for these dates at this place.",
    );
  });

  it("moves February 29 to February 28 in a year that has none", async () => {
    const sent: URL[] = [];
    // Any year's days will do. Only the dates asked for matter here.
    const anyYear = JSON.stringify(
      new Map(Object.entries(MOAB_OCTOBER ?? {})).get("2025"),
    );
    const client = new ArchiveClient({
      fetch: (url) => {
        sent.push(new URL(typeof url === "string" ? url : ""));
        return Promise.resolve(new Response(anyYear));
      },
    });
    await client.seasonalAverages(
      MOAB,
      [new CalendarDate(2028, 2, 22)],
      new CalendarDate(2027, 6, 1),
    );
    const windows = sent.map(
      (url) =>
        `${url.searchParams.get("start_date") ?? ""} ${url.searchParams.get("end_date") ?? ""}`,
    );
    expect(windows).toContain("2025-02-15 2025-02-28");
    expect(windows).toContain("2024-02-15 2024-02-29");
  });

  it("refuses an error status with no reason, and a call that can't be made", async () => {
    const refused = new ArchiveClient({
      fetch: () => Promise.resolve(new Response("", { status: 503 })),
    });
    await expect(
      refused.seasonalAverages(MOAB, STAY_DATES, TODAY),
    ).rejects.toThrow("Open-Meteo refused the request with status 503.");
    const unreachable = new ArchiveClient({
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(
      unreachable.seasonalAverages(MOAB, STAY_DATES, TODAY),
    ).rejects.toThrow("Open-Meteo couldn't be reached. Try again.");
  });
});
