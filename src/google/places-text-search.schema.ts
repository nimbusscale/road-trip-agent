import { z } from "zod";

import { OpeningPeriod } from "../domain/opening-period.js";
import type { PlaceFields } from "../domain/place.js";
import type { PriceLevel } from "../domain/price-level.js";
import { TimeOfDay } from "../domain/time-of-day.js";
import { WEEKDAYS } from "../domain/weekday.js";
import { secondsSchema } from "./routes.schema.js";

// A Places API (New) Text Search response, with the fields in FIELD_MASK
// (places-client.ts). Google leaves out any field a place doesn't have, and returns {}
// when nothing matches (Google design 2.2). Each place becomes a place's facts, in the
// domain model's names (domain model 3.10).

// Google's name for each price level. PRICE_LEVEL_UNSPECIFIED means it has none.
const PRICE_LEVELS_BY_GOOGLE_NAME = new Map<string, PriceLevel | null>([
  ["PRICE_LEVEL_UNSPECIFIED", null],
  ["PRICE_LEVEL_FREE", "free"],
  ["PRICE_LEVEL_INEXPENSIVE", "inexpensive"],
  ["PRICE_LEVEL_MODERATE", "moderate"],
  ["PRICE_LEVEL_EXPENSIVE", "expensive"],
  ["PRICE_LEVEL_VERY_EXPENSIVE", "veryExpensive"],
]);

// A price level Google adds later fails the parse, rather than passing as none.
const priceLevelSchema = z
  .string()
  .refine((name) => PRICE_LEVELS_BY_GOOGLE_NAME.has(name), {
    error: "isn't a price level this app knows",
  })
  .transform((name) => PRICE_LEVELS_BY_GOOGLE_NAME.get(name) ?? null);

// Google's types for a street address, a building, or a unit in one.
const ADDRESS_TYPES = new Set(["street_address", "premise", "subpremise"]);

const SECONDS_PER_MINUTE = 60;
const METERS_PER_MILE = 1609.344;

const LAST_WEEKDAY = WEEKDAYS.length - 1;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;

const localizedTextSchema = z.object({ text: z.string() });

// Sunday is day 0.
const pointSchema = z.object({
  day: z.int().min(0).max(LAST_WEEKDAY),
  hour: z.int().min(0).max(LAST_HOUR),
  minute: z.int().min(0).max(LAST_MINUTE),
});

type Point = z.infer<typeof pointSchema>;

const periodSchema = z
  .object({ open: pointSchema, close: pointSchema.optional() })
  .transform(
    ({ open, close }) =>
      new OpeningPeriod({
        openDay: weekdayOf(open),
        openTime: timeOf(open),
        closeDay: close === undefined ? null : weekdayOf(close),
        closeTime: close === undefined ? null : timeOf(close),
      }),
  );

// A field Google leaves out becomes null, as the domain model stores an empty value.
function orNull<T extends z.ZodType>(
  schema: T,
): z.ZodPipe<z.ZodOptional<T>, z.ZodTransform<z.output<T> | null>> {
  return schema.optional().transform((value) => value ?? null);
}

const textOrNullSchema = localizedTextSchema
  .optional()
  .transform((localized) => emptyAsNull(localized?.text));

const hoursSchema = z
  .object({
    periods: z.array(periodSchema).default([]),
    weekdayDescriptions: z.array(z.string()).default([]),
  })
  .default({ periods: [], weekdayDescriptions: [] });

const googlePlaceFieldsSchema = z.object({
  id: z.string().min(1),
  displayName: textOrNullSchema,
  primaryTypeDisplayName: textOrNullSchema,
  types: z.array(z.string()).default([]),
  formattedAddress: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  rating: orNull(z.number().min(1).max(5)),
  userRatingCount: orNull(z.int().nonnegative()),
  priceLevel: orNull(priceLevelSchema),
  regularOpeningHours: hoursSchema,
  googleMapsUri: z.string().optional(),
  editorialSummary: textOrNullSchema,
  generativeSummary: z
    .object({ overview: textOrNullSchema })
    .optional()
    .transform((summary) => summary?.overview ?? null),
  reviewSummary: z
    .object({ text: textOrNullSchema, reviewsUri: z.string().optional() })
    .optional(),
});

type GooglePlace = z.output<typeof googlePlaceFieldsSchema>;

const googlePlaceSchema = googlePlaceFieldsSchema.transform(factsOf);

export const textSearchResponseSchema = z
  .object({ places: z.array(googlePlaceSchema).default([]) })
  .transform((response) => response.places);

// A drive in a place's routing summary. Google leaves out a value that's zero.
const summaryDriveSchema = z
  .object({
    duration: secondsSchema.default(0),
    distanceMeters: z.number().nonnegative().default(0),
  })
  .transform((drive) => ({
    driveTimeInMinutes: Math.round(drive.duration / SECONDS_PER_MINUTE),
    distanceInMiles: drive.distanceMeters / METERS_PER_MILE,
  }));

export type SummaryDrive = z.output<typeof summaryDriveSchema>;

// The drive from the route's start to the place, then from the place to the route's
// end. Google gives an empty summary for a place it has none for.
const routingSummarySchema = z
  .object({ legs: z.array(summaryDriveSchema).default([]) })
  .transform(({ legs }) => {
    const [fromStart, toEnd] = legs;
    return legs.length === 2 && fromStart !== undefined && toEnd !== undefined
      ? { fromStart, toEnd }
      : null;
  });

export type RouteSummary = NonNullable<z.output<typeof routingSummarySchema>>;

// A search along a route, with ALONG_ROUTE_FIELD_MASK's fields (places-client.ts).
// Each routing summary is for the place at the same position (Google design 2.3).
export const alongRouteResponseSchema = z
  .object({
    places: z.array(googlePlaceSchema).default([]),
    routingSummaries: z.array(routingSummarySchema).default([]),
  })
  .transform(({ places, routingSummaries }) =>
    places.map((facts, index) => ({
      facts,
      route: routingSummaries[index] ?? null,
    })),
  );

// A response with only NAME_MATCH_FIELD_MASK's fields (places-client.ts), for the plain
// names compute_route takes (tool design 2.4). The best match, or null when there's
// none. It isn't saved, so it needs nothing more.
export const nameMatchResponseSchema = z
  .object({
    places: z
      .array(
        z.object({
          id: z.string().min(1),
          displayName: textOrNullSchema,
          formattedAddress: z.string(),
        }),
      )
      .default([]),
  })
  .transform((response) => {
    const match = response.places[0];
    return match === undefined
      ? null
      : {
          googlePlaceId: match.id,
          name: match.displayName,
          address: match.formattedAddress,
        };
  });

export type NameMatch = NonNullable<z.output<typeof nameMatchResponseSchema>>;

function weekdayOf(point: Point): (typeof WEEKDAYS)[number] {
  const weekday = WEEKDAYS[point.day];
  if (weekday === undefined) {
    throw new RangeError(`Google gave day ${String(point.day)}.`);
  }
  return weekday;
}

function timeOf(point: Point): TimeOfDay {
  return new TimeOfDay(point.hour, point.minute);
}

function factsOf(place: GooglePlace): Omit<PlaceFields, "id"> {
  return {
    googlePlaceId: place.id,
    name: isAddress(place) ? null : place.displayName,
    type: place.primaryTypeDisplayName,
    address: place.formattedAddress,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    priceLevel: place.priceLevel,
    openingPeriods: place.regularOpeningHours.periods,
    weekdayHoursLines: place.regularOpeningHours.weekdayDescriptions,
    // Editorial, generated, and from reviews. Only the review summary mentions
    // downsides (Google design 2.2).
    summaries: presentTexts([
      place.editorialSummary,
      place.generativeSummary,
      place.reviewSummary?.text ?? null,
    ]),
    // Its Google Maps page, and its reviews page when Google has one.
    links: presentTexts([
      place.googleMapsUri ?? null,
      place.reviewSummary?.reviewsUri ?? null,
    ]),
  };
}

// Google names a street address with its street line, such as "712 Neches St". That
// isn't a name, so the place starts with none, and the first name an agent gives, such
// as "Mike's house", fills it in (domain model 3.10). An address has no type. A named
// building, such as a hotel, can also be a premise, but it has a type, so it keeps
// Google's name.
function isAddress(place: GooglePlace): boolean {
  return (
    place.primaryTypeDisplayName === null &&
    place.types.some((type) => ADDRESS_TYPES.has(type))
  );
}

function emptyAsNull(text: string | undefined): string | null {
  return text === undefined || text.trim() === "" ? null : text;
}

function presentTexts(texts: readonly (string | null)[]): string[] {
  return texts.filter((text): text is string => text !== null);
}
