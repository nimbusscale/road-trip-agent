import { CalendarDate } from "../domain/calendar-date.js";
import type { Place } from "../domain/place.js";
import { isTimeoutError, jsonBodyOf } from "../google/json-body.js";
import { archiveResponseSchema, type PastDay } from "./archive.schema.js";
import {
  type SeasonalAverages,
  seasonalAveragesOf,
} from "./seasonal-averages.js";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// Open-Meteo asks for an identifying User-Agent, since there's no key (Open-Meteo
// design section 1).
export const USER_AGENT =
  "road-trip-agent (https://github.com/nimbusscale/road-trip-agent)";

// The last 10 complete years (Open-Meteo design 2.2).
export const YEARS = 10;

// Each year's request covers the stay's dates plus this many days on each side.
export const WINDOW_DAYS = 7;

export const TIMEOUT_MILLISECONDS = 10_000;

export interface ArchiveClientOptions {
  // The global fetch in the app. Tests pass a fake that returns saved responses.
  fetch: typeof fetch;
}

// An Open-Meteo call that failed, or a spent limit. The message is written for the
// agent.
export class OpenMeteoError extends Error {
  override name = "OpenMeteoError";
}

// Calls the Historical Weather API, one request per year (Open-Meteo design 2.2).
export class ArchiveClient {
  readonly #options: ArchiveClientOptions;

  constructor(options: ArchiveClientOptions) {
    this.#options = options;
  }

  // The years are counted back from today, not from the stay's year. Planning on
  // October 11, 2026 uses 2016 to 2025, even for a trip in 2027.
  async seasonalAverages(
    place: Place,
    dates: readonly CalendarDate[],
    today: CalendarDate,
  ): Promise<SeasonalAverages> {
    const first = dates[0];
    const last = dates.at(-1);
    if (first === undefined || last === undefined) {
      throw new OpenMeteoError("Seasonal averages need at least one date.");
    }
    const lastYear = today.year - 1;
    const years = Array.from(
      { length: YEARS },
      (unused, index) => lastYear - YEARS + 1 + index,
    );
    // One year at a time. Open-Meteo refuses requests sent all at once with "Too many
    // concurrent requests", and the weather worker can look up several places at once
    // (Open-Meteo design 2.2).
    const days: PastDay[][] = [];
    for (const year of years) {
      days.push(
        await this.#daysOf(
          place,
          inYear(first.plusDays(-WINDOW_DAYS), year - first.year),
          inYear(last.plusDays(WINDOW_DAYS), year - first.year),
        ),
      );
    }
    const averages = seasonalAveragesOf(days.flat(), {
      first: years[0] ?? lastYear,
      last: lastYear,
    });
    if (averages === null) {
      throw new OpenMeteoError(
        "Open-Meteo has no past weather for these dates at this place.",
      );
    }
    return averages;
  }

  async #daysOf(
    place: Place,
    start: CalendarDate,
    end: CalendarDate,
  ): Promise<PastDay[]> {
    const body = await this.#get(place, start, end);
    const parsed = archiveResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new OpenMeteoError(
        `Open-Meteo sent a response the app doesn't understand: ${parsed.error.message}`,
      );
    }
    // A spent limit can come with a good status, so the body decides (Open-Meteo design
    // 2.4).
    if (parsed.data.kind === "error") {
      throw new OpenMeteoError(
        `Seasonal averages are unavailable right now. Open-Meteo said: "${parsed.data.reason}"`,
      );
    }
    return parsed.data.days;
  }

  async #get(
    place: Place,
    start: CalendarDate,
    end: CalendarDate,
  ): Promise<unknown> {
    const url = new URL(ARCHIVE_URL);
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    url.searchParams.set("start_date", start.toText());
    url.searchParams.set("end_date", end.toText());
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,rain_sum,snowfall_sum",
    );
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("precipitation_unit", "inch");
    url.searchParams.set("timezone", "auto");
    let response: Response;
    let body: unknown;
    try {
      response = await this.#options.fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
      });
      // The timeout covers reading the body too.
      body = await jsonBodyOf(response);
    } catch (error) {
      throw new OpenMeteoError(failedCallMessage(error), { cause: error });
    }
    if (!response.ok && !isErrorBody(body)) {
      throw new OpenMeteoError(
        `Open-Meteo refused the request with status ${String(response.status)}.`,
      );
    }
    return body;
  }
}

// The same month and day, the given number of years later. February 29 becomes
// February 28 in a year that has none.
function inYear(date: CalendarDate, yearsLater: number): CalendarDate {
  const year = date.year + yearsLater;
  const daysInMonth = new Date(Date.UTC(year, date.month, 0)).getUTCDate();
  return new CalendarDate(year, date.month, Math.min(date.day, daysInMonth));
}

// Open-Meteo's own error body, whose reason the agent should see.
function isErrorBody(body: unknown): boolean {
  return archiveResponseSchema.safeParse(body).data?.kind === "error";
}

function failedCallMessage(error: unknown): string {
  if (isTimeoutError(error)) {
    return `Open-Meteo didn't answer within ${String(TIMEOUT_MILLISECONDS / 1000)} seconds. Try again.`;
  }
  return "Open-Meteo couldn't be reached. Try again.";
}
