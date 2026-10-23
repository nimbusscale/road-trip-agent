import { z } from "zod";

// The place tools' inputs (tool design, section 2.3). Each input says only how to pass
// its value.

export const FIND_PLACE_INPUT = z.strictObject({
  text: z
    .string()
    .describe(
      'The place\'s name or street address, such as "Milt\'s Stop & Eat" or "712 Neches St".',
    ),
  where: z
    .string()
    .describe('A town, region, or state, such as "Moab, UT" or "Utah".'),
});

export const READ_PLACE_INPUT = z.strictObject({
  placeId: z.string().describe("A place ID, such as place_k7m2x9qa."),
});
