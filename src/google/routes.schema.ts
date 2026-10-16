import { z } from "zod";

// A Routes API computeRoutes response, with the fields in the client's field mask
// (routes-client.ts). Google leaves out a field whose value is zero, such as a segment
// between two places at the same spot, and returns {} when there's no driving route
// (Google design 2.3). Google calls a segment a "leg", and our leg a "route".

// A duration, such as "5412s".
const secondsSchema = z
  .string()
  .regex(/^\d+(\.\d+)?s$/, { error: "isn't a duration in seconds" })
  .transform((text) => Number.parseFloat(text.slice(0, -1)));

const routeSchema = z.object({
  distanceMeters: z.number().nonnegative().default(0),
  legs: z.array(
    z
      .object({ duration: secondsSchema.default(0) })
      .transform((segment) => segment.duration),
  ),
  polyline: z.object({ encodedPolyline: z.string() }),
  // Only when the request asked for the best order.
  optimizedIntermediateWaypointIndex: z.array(z.int()).optional(),
});

export const routesResponseSchema = z
  .object({ routes: z.array(routeSchema).optional() })
  .transform((body) => body.routes?.[0] ?? null);

export type GoogleRoute = NonNullable<z.infer<typeof routesResponseSchema>>;
