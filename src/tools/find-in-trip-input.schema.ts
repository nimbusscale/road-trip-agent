import { z } from "zod";

// The find_in_trip tool's input (tool design, section 2.1). It takes only the text, with
// no stay or day to narrow it: the coordinator often won't know the stay, and an
// optional input goes against tool design section 4. The name is the one find_place
// takes.
export const FIND_IN_TRIP_INPUT = z.strictObject({
  text: z
    .string()
    .describe(
      'The place\'s name, or part of it, as the user said it, such as "Desert Rose" or "the Desert Pearl".',
    ),
});
