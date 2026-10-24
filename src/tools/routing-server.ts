import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { PlacesClient } from "../google/places-client.js";
import { RoutesClient } from "../google/routes-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import { PlaceRepository } from "../persistence/place-repository.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import { computeRouteTool } from "./route-tools.js";
import type { RoutingSession } from "./routing-session.js";

// Part of every tool name the model sees, such as mcp__routing__compute_route (tool
// design, section 1).
export const ROUTING_SERVER_NAME = "routing";

export interface RoutingAccessGiven {
  env: Env;
  pool: Connectable & Queryable;
  settings: Settings;
}

// What every session's routing server shares, made once when the app starts. Routes
// come from Google Routes, and plain names are matched with Google Places (tool design,
// section 1).
export function routingAccessFor(
  given: RoutingAccessGiven,
): Omit<RoutingSession, "tripId"> {
  const { env, pool, settings } = given;
  const apiKey = env.googleMapsServerKey;
  return {
    places: new PlaceReader({
      pool,
      makeStore: (connection: Queryable) => new PlaceRepository(connection),
    }),
    google: new PlacesClient({ apiKey, fetch }),
    routeFinder: new RoutesClient({ apiKey, fetch }),
    settings,
  };
}

// Made for each session, with its trip already set. One server object can't be shared
// by two sessions running at once (tool design, section 4).
export function createRoutingServer(
  session: RoutingSession,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: ROUTING_SERVER_NAME,
    // The coordinator routes every shape sketch, so it's never left for it to find with
    // a tool search.
    alwaysLoad: true,
    tools: [computeRouteTool(session)],
  });
}
