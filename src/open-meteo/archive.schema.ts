import { z } from "zod";

// An Open-Meteo Historical Weather API response, with the daily values the client asks
// for (Open-Meteo design 2.2). Each value is null for a day with no data yet, such as a
// day in the last week. `rain_sum` leaves out snow, unlike `precipitation_sum`. A spent limit is normal JSON with "error": true and a reason,
// and no daily values (section 2.4).

const valuesSchema = z.array(z.number().nullable());

export const archiveResponseSchema = z.union([
  z
    .object({ error: z.literal(true), reason: z.string() })
    .transform((body) => ({ kind: "error" as const, reason: body.reason })),
  z
    .object({
      daily: z.object({
        time: z.array(z.string()),
        temperature_2m_max: valuesSchema,
        temperature_2m_min: valuesSchema,
        rain_sum: valuesSchema,
        snowfall_sum: valuesSchema,
      }),
    })
    .transform((body) => ({
      kind: "days" as const,
      days: daysOf(body.daily),
    })),
]);

export interface PastDay {
  highInFahrenheit: number;
  lowInFahrenheit: number;
  rainInInches: number;
  snowInInches: number;
}

// The days with every value. A day missing any of them is left out.
function daysOf(daily: {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  rain_sum: (number | null)[];
  snowfall_sum: (number | null)[];
}): PastDay[] {
  return daily.time.flatMap((date, index) => {
    const high = daily.temperature_2m_max[index];
    const low = daily.temperature_2m_min[index];
    const rain = daily.rain_sum[index];
    const snow = daily.snowfall_sum[index];
    if (high == null || low == null || rain == null || snow == null) {
      return [];
    }
    return [
      {
        highInFahrenheit: high,
        lowInFahrenheit: low,
        rainInInches: rain,
        snowInInches: snow,
      },
    ];
  });
}
