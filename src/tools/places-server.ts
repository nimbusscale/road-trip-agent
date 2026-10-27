import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import type { Env } from "../config/env.schema.js";
import type { Settings } from "../config/settings.schema.js";
import { PlacesClient } from "../google/places-client.js";
import { PlaceReader } from "../persistence/place-reader.js";
import { PlaceRepository } from "../persistence/place-repository.js";
import { PlaceWriter } from "../persistence/place-writer.js";
import type { Connectable, Queryable } from "../persistence/queryable.js";
import { TripReader } from "../persistence/trip-reader.js";
import { TripRepository } from "../persistence/trip-repository.js";
import { findPlaceTool, readPlaceTool } from "./place-tools.js";
import type { PlacesSession } from "./places-session.js";

// Part of every tool name the model sees, such as mcp__places__find_place (tool design,
// section 1).
export const PLACES_SERVER_NAME = "places";

export interface PlacesAccessGiven {
  env: Env;
  pool: Connectable & Queryable;
  settings: Settings;
}

// What every session's places server shares, made once when the app starts. Places come
// from Google Places (tool design, section 1).
export function placesAccessFor(
  given: PlacesAccessGiven,
): Omit<PlacesSession, "tripId"> {
  const { env, pool, settings } = given;
  const makeStore = (connection: Queryable): PlaceRepository =>
    new PlaceRepository(connection);
  return {
    reader: new TripReader(
      pool,
      (connection) => new TripRepository(connection),
    ),
    places: new PlaceReader({ pool, makeStore }),
    placeWriter: new PlaceWriter({ pool, makeStore }),
    google: new PlacesClient({ apiKey: env.googleMapsServerKey, fetch }),
    settings,
    now: () => new Date(),
  };
}

// Made for each session, with its trip already set. One server object can't be shared
// by two sessions running at once (tool design, section 4).
export function createPlacesServer(
  session: PlacesSession,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: PLACES_SERVER_NAME,
    // The coordinator looks up every town and place the user names, so these are never
    // left for it to find with a tool search.
    alwaysLoad: true,
    tools: [findPlaceTool(session), readPlaceTool(session)],
  });
}
