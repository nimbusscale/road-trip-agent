import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import { readTripBriefTool, updateTripBriefTool } from "./trip-brief-tools.js";
import type { TripSession } from "./trip-session.js";

// Part of every tool name the model sees, such as mcp__trip__read_trip_brief (tool
// design, section 1).
export const TRIP_SERVER_NAME = "trip";

// The server's description, which the model reads as its instructions.
export const TRIP_SERVER_INSTRUCTIONS =
  "Reads and changes the trip this session is planning. The trip is already set, so no tool takes a trip ID. A change is saved at once, in one save: when any part of it is refused, nothing is saved, and the error says why. Each change replies with the feasibility check results it made new or gone.";

// Made for each session, with its trip already set. One server object can't be shared
// by two sessions running at once (tool design, section 4).
export function createTripServer(
  session: TripSession,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: TRIP_SERVER_NAME,
    instructions: TRIP_SERVER_INSTRUCTIONS,
    // The coordinator uses these tools in most turns, so they're never left for it to
    // find with a tool search.
    alwaysLoad: true,
    tools: [readTripBriefTool(session), updateTripBriefTool(session)],
  });
}
