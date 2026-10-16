import { z } from "zod";

import { OpeningPeriod } from "../domain/opening-period.js";
import type { PlaceFields } from "../domain/place.js";
import { PRICE_LEVELS } from "../domain/price-level.js";
import { TIME_OF_DAY_TEXT, TimeOfDay } from "../domain/time-of-day.js";
import { WEEKDAYS } from "../domain/weekday.js";

// A row of the places table (migrations/0006_places.sql). pg turns jsonb into objects,
// text[] into arrays, and double precision into numbers. Values are checked here only
// for their type. Place and OpeningPeriod run their own rules when they're built.

const timeOfDaySchema = z
  .string()
  .regex(TIME_OF_DAY_TEXT)
  .transform((text) => TimeOfDay.fromText(text));

const openingPeriodSchema = z
  .strictObject({
    openDay: z.enum(WEEKDAYS),
    openTime: timeOfDaySchema,
    closeDay: z.enum(WEEKDAYS).nullable(),
    closeTime: timeOfDaySchema.nullable(),
  })
  .transform((fields) => new OpeningPeriod(fields));

export const placeRowSchema = z
  .object({
    id: z.string(),
    trip_id: z.string(),
    google_place_id: z.string(),
    name: z.string().nullable(),
    type: z.string().nullable(),
    address: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    rating: z.number().nullable(),
    review_count: z.int().nullable(),
    price_level: z.enum(PRICE_LEVELS).nullable(),
    opening_periods: z.array(openingPeriodSchema),
    weekday_hours_lines: z.array(z.string()),
    summaries: z.array(z.string()),
    links: z.array(z.string()),
  })
  .transform((row): PlaceFields => ({
    id: row.id,
    googlePlaceId: row.google_place_id,
    name: row.name,
    type: row.type,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    rating: row.rating,
    reviewCount: row.review_count,
    priceLevel: row.price_level,
    openingPeriods: row.opening_periods,
    weekdayHoursLines: row.weekday_hours_lines,
    summaries: row.summaries,
    links: row.links,
  }));
