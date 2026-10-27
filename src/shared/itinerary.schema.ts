import { z } from "zod";

// The shape of the itinerary view's reply (functional spec 9). The front end parses it
// with this schema. Dates are ISO text. Times and durations come as text, such as
// "8:25 a.m." and "1 h 20 m", written by the same functions as the coordinator's tools,
// so the view and the chat give the same times. Distances are in miles (functional spec
// 9.7).

// Each place has its position, for the map's markers (functional spec 9.2). `name` is
// the address when the place has no name.
export const shownPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

export type ShownPlace = z.infer<typeof shownPlaceSchema>;

// A selected place, with why it was picked and where its facts came from (functional
// spec 7.6). The source link is null for a place the user named.
export const shownSelectionSchema = z.object({
  place: shownPlaceSchema,
  rationale: z.string(),
  namedByUser: z.boolean(),
  sourceLink: z.string().nullable(),
});

export type ShownSelection = z.infer<typeof shownSelectionSchema>;

// Empty, proposed, or selected (functional spec 4, Status). `candidateCount` is how
// many places have been offered, and `selection` is set only when one is selected.
export const shownChoiceSchema = z.object({
  status: z.enum(["empty", "proposed", "selected"]),
  candidateCount: z.number(),
  selection: shownSelectionSchema.nullable(),
});

export type ShownChoice = z.infer<typeof shownChoiceSchema>;

export const shownSummarySchema = z.object({
  name: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  startPlace: shownPlaceSchema.nullable(),
  endPlace: shownPlaceSchema.nullable(),
  // Without the drive buffer, as each leg shows it.
  totalDriveTime: z.string(),
  dayCount: z.number(),
  stayCount: z.number(),
  // Such as "mid-range". Null until the trip brief has them.
  defaultTier: z.string().nullable(),
  budgetRules: z.string().nullable(),
});

export type ShownSummary = z.infer<typeof shownSummarySchema>;

// `arriveDate` is the first night's date, and `leaveDate` the morning the party leaves.
// Both are null until the trip has a start date.
export const shownStaySchema = z.object({
  id: z.string(),
  number: z.number(),
  place: shownPlaceSchema,
  nightCount: z.number(),
  arriveDate: z.string().nullable(),
  leaveDate: z.string().nullable(),
  lodging: shownChoiceSchema,
});

export type ShownStay = z.infer<typeof shownStaySchema>;

// A route type differs from the trip's only when the user chose it for this day, with
// a reason (functional spec 9.4).
export const shownRouteTypeSchema = z.object({
  routeType: z.enum(["scenic", "fastest"]),
  reason: z.string(),
});

// The day's drive. The drive time, distance, and route line are null until Google has
// routed it. The drive time is without the drive buffer. `stopsAlongTheWay` names the
// selected stops searched for along the leg.
export const shownLegSchema = z.object({
  from: shownPlaceSchema,
  to: shownPlaceSchema,
  driveTime: z.string().nullable(),
  distanceInMiles: z.number().nullable(),
  routeLine: z.string().nullable(),
  stopsAlongTheWay: z.array(z.string()),
  routeType: shownRouteTypeSchema.nullable(),
});

export type ShownLeg = z.infer<typeof shownLegSchema>;

export const shownStopSchema = z.object({
  id: z.string(),
  number: z.number(),
  kind: z.enum(["meal", "attraction"]),
  purpose: z.string(),
  setTime: z.string().nullable(),
  choice: shownChoiceSchema,
});

export type ShownStop = z.infer<typeof shownStopSchema>;

// One item of the day's schedule, in time order. The times are null while they aren't
// known, such as for a stop with no selected place and no set time. `duration` is for a
// drive or free time.
export const shownEntrySchema = z.object({
  kind: z.enum(["drive", "stop", "freeTime"]),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  duration: z.string().nullable(),
  stop: shownStopSchema.nullable(),
});

export type ShownEntry = z.infer<typeof shownEntrySchema>;

// Where the last drive ends: where the party sleeps, or the end place.
export const shownArrivalSchema = z.object({
  place: shownPlaceSchema,
  time: z.string().nullable(),
});

// `location` is the towns the day runs between, such as "Monterey → San Luis Obispo",
// or null until the start or end place is set.
export const shownDaySchema = z.object({
  id: z.string(),
  number: z.number(),
  date: z.string().nullable(),
  location: z.string().nullable(),
  startTime: z.string(),
  isRestDay: z.boolean(),
  isLastDay: z.boolean(),
  leg: shownLegSchema.nullable(),
  schedule: z.array(shownEntrySchema),
  arrival: shownArrivalSchema.nullable(),
});

export type ShownDay = z.infer<typeof shownDaySchema>;

export const itineraryResponseSchema = z.object({
  summary: shownSummarySchema,
  stays: z.array(shownStaySchema),
  days: z.array(shownDaySchema),
});

export type ItineraryResponse = z.infer<typeof itineraryResponseSchema>;
