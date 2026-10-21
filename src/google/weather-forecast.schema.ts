import { z } from "zod";

// A Weather API forecast/days:lookup response, with only the fields the weather tool
// returns (Google design section 3). Google leaves out a value that's zero elsewhere,
// such as a Routes duration, so a missing chance counts as 0.

const degreesSchema = z
  .object({ degrees: z.number() })
  .transform((temperature) => temperature.degrees);

const percentSchema = z.number().min(0).max(100).default(0);

// Such as "snow" for SNOW or "rain and snow" for RAIN_AND_SNOW. A chance with no type
// is named "precipitation".
const precipitationTypeSchema = z
  .string()
  .optional()
  .transform((type) =>
    type === undefined || type === "NONE" || type.endsWith("_UNSPECIFIED")
      ? "precipitation"
      : type.toLowerCase().replaceAll("_", " "),
  );

const forecastDaySchema = z
  .object({
    displayDate: z.object({
      year: z.int(),
      month: z.int(),
      day: z.int(),
    }),
    maxTemperature: degreesSchema,
    minTemperature: degreesSchema,
    daytimeForecast: z.object({
      weatherCondition: z.object({
        description: z.object({ text: z.string() }),
      }),
      precipitation: z
        .object({
          probability: z
            .object({ type: precipitationTypeSchema, percent: percentSchema })
            .default({ type: "precipitation", percent: 0 }),
        })
        .default({ probability: { type: "precipitation", percent: 0 } }),
      thunderstormProbability: percentSchema,
    }),
  })
  .transform((day) => ({
    displayDate: day.displayDate,
    highInFahrenheit: day.maxTemperature,
    lowInFahrenheit: day.minTemperature,
    conditions: day.daytimeForecast.weatherCondition.description.text,
    precipitation: day.daytimeForecast.precipitation.probability.type,
    precipitationChancePercent:
      day.daytimeForecast.precipitation.probability.percent,
    thunderstormChancePercent: day.daytimeForecast.thunderstormProbability,
  }));

export const forecastResponseSchema = z
  .object({ forecastDays: z.array(forecastDaySchema).default([]) })
  .transform((body) => body.forecastDays);

export type GoogleForecastDay = z.infer<typeof forecastDaySchema>;
