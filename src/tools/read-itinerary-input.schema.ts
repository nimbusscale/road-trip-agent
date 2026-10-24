import { z } from "zod";

// The read_itinerary tool's input (tool design, section 2.1). The scope is required, so
// a whole read is asked for by name, never by leaving the input out.
export const WHOLE_ITINERARY = "all";

export const READ_ITINERARY_INPUT = z.strictObject({
  scope: z
    .string()
    .describe(
      `"${WHOLE_ITINERARY}", or a day, stay, or stop ID, such as day_k7m2x9qa.`,
    ),
});
