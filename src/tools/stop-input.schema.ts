import { z } from "zod";

import type { SearchArea } from "../domain/search-area.js";
import { CLOCK_TIME_ERROR, isScheduleTimeText } from "./clock-time.js";
import { FIRST } from "./trip-items.js";

// The inputs of the tools that lay out a day's stops, select places, and reject them
// (tool design 2.1). Each input says only how to pass its value. What each item means
// is in the coordinator's instructions (tool design, section 4).

// A stop's set time takes this in place of a time, for no set time, since in the update
// tools a blank means "don't change it" (tool design 2.1, "Times are clock times"). Not
// "default", which is a day's start time's word.
export const NO_SET_TIME = "none";

// The search areas a stop takes by name. A stop near a stay takes the stay's ID instead.
export const NAMED_SEARCH_AREAS = [
  "alongLeg",
  "nearStartPlace",
  "nearEndPlace",
] as const satisfies readonly SearchArea[];

// Such as '"alongLeg", "nearStartPlace", or "nearEndPlace"'.
export const NAMED_SEARCH_AREA_TEXT = `"alongLeg", "nearStartPlace", or "nearEndPlace"`;

const placeId = z.string().describe("A place ID, such as place_k7m2x9qa.");

const stopId = z.string().describe("A stop ID, such as stop_k7m2x9qa.");

const dayId = z.string().describe("A day ID, such as day_k7m2x9qa.");

const stopOrStayId = z
  .string()
  .describe("A stop or stay ID, such as stop_k7m2x9qa or stay_k7m2x9qa.");

const after = z
  .string()
  .describe(`The ID of the stop it goes after on that day, or "${FIRST}".`);

const setTime = z
  .string()
  .refine((text) => text === NO_SET_TIME || isScheduleTimeText(text), {
    error: `${CLOCK_TIME_ERROR}, or "${NO_SET_TIME}". A time after midnight ends with "the next day".`,
  })
  .describe(
    `A clock time, such as "7:00 p.m.", or "${NO_SET_TIME}" for no set time. A time after midnight ends with "the next day", such as "1:00 a.m. the next day".`,
  );

// A number, not an integer: Zod gives every integer a maximum of 2^53 - 1, which the
// model would read as part of the schema.
const visitTimeInMinutes = z
  .number()
  .positive()
  .refine(Number.isInteger, {
    error: "A visit time is a whole number of minutes.",
  })
  .describe("A whole number of minutes, such as 90.");

const reason = z.string().describe("The user's reason, in a few words.");

const searchArea = z
  .string()
  .describe(
    `A stay ID, such as stay_k7m2x9qa, for near that stay, or ${NAMED_SEARCH_AREA_TEXT}.`,
  );

const purpose = z
  .string()
  .describe(
    'In a few words, such as "dessert" or "a long hike, about 5 hours".',
  );

const newMealOrAttraction = z.strictObject({
  kind: z.enum(["meal", "attraction"]),
  purpose,
  searchArea,
  setTime,
});

// Its place is where the party sleeps that night, so it takes no search area.
const newCheckIn = z.strictObject({
  kind: z.literal("checkIn"),
  purpose,
  setTime,
});

export const ADD_STOPS_INPUT = z.strictObject({
  dayId,
  after,
  stops: z
    .array(z.discriminatedUnion("kind", [newMealOrAttraction, newCheckIn]))
    .min(1)
    .describe("In the order they go on the day."),
});

export const UPDATE_STOP_INPUT = z.strictObject({
  stopId,
  setTime: setTime.optional(),
  visitTimeInMinutes: visitTimeInMinutes.optional(),
  approveOpeningHours: z.strictObject({ reason }).optional(),
  removeApproval: z.enum(["openingHours"]).optional(),
});

export const MOVE_STOP_INPUT = z.strictObject({
  stopId,
  dayId,
  after,
  setTime,
});

export const REMOVE_STOPS_INPUT = z.strictObject({
  stopIds: z.array(stopId).min(1),
});

export const SELECT_CANDIDATE_INPUT = z.strictObject({
  stopOrStayId,
  placeId,
});

export const SELECT_USER_PLACE_INPUT = z.strictObject({
  stopOrStayId,
  placeId,
  name: z
    .string()
    .describe(
      'What to call the place, such as "Mike\'s house". Used only when Google has no name for it.',
    ),
  reason: z
    .string()
    .describe(
      'The user\'s reason, in a few words, or "the user asked for it" when they gave none.',
    ),
  visitTimeInMinutes: visitTimeInMinutes.optional(),
});

export const REJECT_PLACES_INPUT = z.strictObject({
  rejections: z.array(z.strictObject({ placeId, reason })).min(1),
});

export type NewStopInput = z.infer<typeof ADD_STOPS_INPUT>["stops"][number];
export type UpdateStopInput = z.infer<typeof UPDATE_STOP_INPUT>;
export type SelectUserPlaceInput = z.infer<typeof SELECT_USER_PLACE_INPUT>;
