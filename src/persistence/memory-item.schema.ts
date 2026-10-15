import { z } from "zod";

// A row of the memory_items table (migrations/0004_memory_items.sql). pg returns
// timestamptz as a Date.
export const memoryItemRowSchema = z
  .object({
    id: z.string(),
    user_id: z.uuid(),
    trip_id: z.string().nullable(),
    text: z.string(),
    created_date_time: z.date(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    tripId: row.trip_id,
    text: row.text,
    createdDateTime: row.created_date_time,
  }));

// The row from a count query. The query casts the count to int, since pg returns a
// bigint as text.
export const memoryCountRowSchema = z
  .object({ count: z.int().nonnegative() })
  .transform((row) => row.count);
