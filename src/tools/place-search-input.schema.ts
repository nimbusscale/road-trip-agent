import { z } from "zod";

// The place searches' inputs (tool design, section 2.3). Each input says only how to
// pass its value.

const QUERY_TEXT = "What to look for, in a few words";

export const SEARCH_NEAR_INPUT = z.strictObject({
  stopOrStayId: z
    .string()
    .describe(
      "A stop ID or a stay ID, such as stop_k7m2x9qa or stay_k7m2x9qa.",
    ),
  query: z.string().describe(`${QUERY_TEXT}, such as "barbecue" or "hotels".`),
});

export const SEARCH_ALONG_LEG_INPUT = z.strictObject({
  dayId: z.string().describe("A day ID, such as day_k7m2x9qa."),
  query: z
    .string()
    .describe(`${QUERY_TEXT}, such as "scenic viewpoint" or "lunch".`),
});
