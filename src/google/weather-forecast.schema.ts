import { z } from "zod";

// A Weather API forecast/days:lookup response, with only the fields the weather tool
// returns (Google design section 3). Google leaves out a value that's zero elsewhere,
// such as a Routes duration, so a missing chance counts as 0.

const degreesSchema = z
  .object({ degrees: z.number() })
  .transform((temperature) => temperature.degrees);

const percentSchema = z.number().min(0).max(100).default(0);

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
            .object({ percent: percentSchema })
            .default({ percent: 0 }),
        })
        .default({ probability: { percent: 0 } }),
      thunderstormProbability: percentSchema,
    }),
  })
  .transform((day) => ({
    displayDate: day.displayDate,
    highInFahrenheit: day.maxTemperature,
    lowInFahrenheit: day.minTemperature,
    conditions: day.daytimeForecast.weatherCondition.description.text,
    rainChancePercent: day.daytimeForecast.precipitation.probability.percent,
    thunderstormChancePercent: day.daytimeForecast.thunderstormProbability,
  }));

export const forecastResponseSchema = z
  .object({ forecastDays: z.array(forecastDaySchema).default([]) })
  .transform((body) => body.forecastDays);

export type GoogleForecastDay = z.infer<typeof forecastDaySchema>;
