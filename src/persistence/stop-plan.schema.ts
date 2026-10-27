import { z } from "zod";

import {
  DriveHoursApproval,
  OpeningHoursApproval,
  RouteTypeApproval,
} from "../domain/approval.js";
import { HOW_FOUND_VALUES } from "../domain/how-found.js";
import { ROUTE_TYPES } from "../domain/route-type.js";
import { SEARCH_AREAS } from "../domain/search-area.js";
import { STOP_KINDS } from "../domain/stop-kind.js";
import { TIERS } from "../domain/tier.js";
import {
  idListSchema,
  scheduleTimeSchema,
  timeOfDaySchema,
} from "./plan-values.schema.js";

// The parts of the plan document for a day: its stops with their candidates and
// approvals, and its leg (persistence design, section 2). A link is stored as an ID,
// in a property whose name ends in Id or Ids. The domain's itineraryFromStored() turns
// them back into links.

export const candidateSchema = z.strictObject({
  placeId: z.string(),
  rationale: z.string(),
  howFound: z.enum(HOW_FOUND_VALUES),
  sourceLink: z.string().nullable(),
  notesText: z.string().nullable(),
  tier: z.enum(TIERS).nullable(),
  tierRule: z.string().nullable(),
  visitTimeInMinutes: z.number().nullable(),
  detourTimeInMinutes: z.number().nullable(),
  setNumber: z.number(),
});

// Each approval holds its kind, so code knows which value is there (technical spec
// section 8).
export const dayApprovalSchema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("driveHours"),
      reason: z.string(),
      approvedDrivingInHours: z.number(),
    })
    .transform((fields) => new DriveHoursApproval(fields)),
  z
    .strictObject({
      kind: z.literal("routeType"),
      reason: z.string(),
      approvedRouteType: z.enum(ROUTE_TYPES),
    })
    .transform((fields) => new RouteTypeApproval(fields)),
]);

export const stopApprovalSchema = z
  .strictObject({
    kind: z.literal("openingHours"),
    reason: z.string(),
    approvedOpenTimeInMinutes: z.number(),
  })
  .transform((fields) => new OpeningHoursApproval(fields));

export const stopSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(STOP_KINDS),
  purpose: z.string(),
  searchArea: z.enum(SEARCH_AREAS).nullable(),
  searchAreaStayId: z.string().nullable(),
  setTime: scheduleTimeSchema.nullable(),
  visitTimeInMinutes: z.number().nullable(),
  tier: z.enum(TIERS).nullable(),
  tierRule: z.string().nullable(),
  selectedPlaceId: z.string().nullable(),
  candidates: z.array(candidateSchema).readonly(),
  approvals: z.array(stopApprovalSchema).readonly(),
});

export const legSchema = z.strictObject({
  segmentDriveTimesInMinutes: z.array(z.number()).readonly(),
  distanceInMiles: z.number(),
  routeLine: z.string(),
  stopIdsInBestOrder: idListSchema,
  timeSavedInMinutes: z.number(),
  routedFromPlaceId: z.string(),
  routedToPlaceId: z.string(),
  routedStopPlaceIds: idListSchema,
  routedWaypointIds: idListSchema,
});

// A waypoint has no id, so it's stored inside its day, with its place as an ID.
const waypointSchema = z.strictObject({
  placeId: z.string(),
  reason: z.string(),
});

export const daySchema = z.strictObject({
  id: z.string(),
  ownStartTime: timeOfDaySchema.nullable(),
  stops: z.array(stopSchema).readonly(),
  waypoints: z.array(waypointSchema).readonly(),
  leg: legSchema.nullable(),
  approvals: z.array(dayApprovalSchema).readonly(),
});
