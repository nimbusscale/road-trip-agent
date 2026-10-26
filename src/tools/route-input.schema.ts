import { z } from "zod";

// The routing tool's input (tool design 2.4). Each input says only how to pass its
// value.

// Not "stop", which in the itinerary is a meal or attraction on a day. "waypoint" is
// the same idea as a day's waypoints (tool design 2.4).
export const POINT_KINDS = ["stopover", "waypoint"] as const;

export const ROUTE_ORDERS = ["keep", "fastest"] as const;

export const COMPUTE_ROUTE_INPUT = z.strictObject({
  points: z
    .array(
      z.strictObject({
        place: z
          .string()
          .describe(
            'A place ID, such as place_k7m2x9qa, or a plain name with its state, such as "Moab, UT".',
          ),
        kind: z.enum(POINT_KINDS),
      }),
    )
    .min(2)
    .describe("In driving order. The first and the last are stopovers."),
  order: z.enum(ROUTE_ORDERS),
});

export type RouteInputPoint = z.infer<
  typeof COMPUTE_ROUTE_INPUT
>["points"][number];
