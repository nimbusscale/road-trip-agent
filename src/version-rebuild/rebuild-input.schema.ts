import { z } from "zod";

// What the trip versions rebuild reads from outside the repo (#244).

// What Claude decided where code can't, for one session. It holds the session's data,
// so it's kept outside the repo, and given to the rebuild as a file.
export const rebuildChoicesSchema = z.strictObject({
  // A recorded call today's tool doesn't take, rewritten into today's shape, by the
  // call's tool_use ID, with what changed in its shape.
  rewrittenCalls: z.record(
    z.string(),
    z.strictObject({ input: z.unknown(), shapeChange: z.string().min(1) }),
  ),
  // Live places no reply names, by the tool_use ID of the search that saved them.
  unshownPlaces: z.record(z.string(), z.array(z.string())),
  // A check that didn't run on the recorded trip until a call, by the check's kind and
  // the call's tool_use ID. Its results are dropped after each write before that call,
  // so the rebuilt trip holds the check results the coordinator saw.
  checksNotRunUntil: z.array(
    z.strictObject({
      check: z.string(),
      untilToolUseId: z.string(),
      why: z.string().min(1),
    }),
  ),
});

export type RebuildChoices = z.infer<typeof rebuildChoicesSchema>;

export const NO_CHOICES: RebuildChoices = {
  rewrittenCalls: {},
  unshownPlaces: {},
  checksNotRunUntil: [],
};

// A row read with to_jsonb(), kept whole, so it can be added to the other database as
// it is.
const rowOf = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z
    .object({ row: z.looseObject(shape) })
    .transform(({ row }) => ({ ...row, whole: row }));

export const sessionRowSchema = rowOf({
  id: z.string(),
  trip_id: z.string(),
  created_date_time: z.string(),
}).transform((row) => ({
  id: row.id,
  tripId: row.trip_id,
  createdDateTime: new Date(row.created_date_time),
  whole: row.whole,
}));

export const tripRowSchema = rowOf({
  owner_id: z.string(),
  plan: z.looseObject({
    tripBrief: z.looseObject({ id: z.string() }),
    itinerary: z.looseObject({
      id: z.string(),
      lastDay: z.looseObject({ id: z.string() }),
    }),
  }),
}).transform((row) => ({
  ownerId: row.owner_id,
  plan: row.plan,
  briefId: row.plan.tripBrief.id,
  itineraryId: row.plan.itinerary.id,
  lastDayId: row.plan.itinerary.lastDay.id,
}));

export const placeRowSchema = rowOf({ id: z.string() }).transform((row) => ({
  id: row.id,
  whole: row.whole,
}));

export const memoryRowSchema = rowOf({
  id: z.string(),
  trip_id: z.string().nullable(),
  created_date_time: z.string(),
}).transform((row) => ({
  id: row.id,
  tripId: row.trip_id,
  createdDateTime: new Date(row.created_date_time),
  whole: row.whole,
}));

export const versionRowSchema = rowOf({
  turn: z.number().int(),
  user_message: z.string(),
}).transform((row) => ({
  turn: row.turn,
  userMessage: row.user_message,
  whole: row.whole,
}));

export const countRowSchema = z
  .object({ count: z.coerce.number() })
  .transform(({ count }) => count);
