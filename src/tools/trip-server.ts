import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import {
  addLodgingCandidatesTool,
  addStopCandidatesTool,
} from "./candidate-tools.js";
import { setWaypointsTool, updateDayTool } from "./day-tools.js";
import { findInTripTool } from "./find-in-trip-tool.js";
import { readItineraryTool } from "./itinerary-tools.js";
import { rejectPlacesTool } from "./reject-places-tool.js";
import { selectCandidateTool, selectUserPlaceTool } from "./selection-tools.js";
import { addStayTool, removeStayTool, updateStayTool } from "./stay-tools.js";
import { setStayWeatherTool } from "./stay-weather-tool.js";
import {
  addStopsTool,
  moveStopTool,
  removeStopsTool,
  updateStopTool,
} from "./stop-tools.js";
import { readTripBriefTool, updateTripBriefTool } from "./trip-brief-tools.js";
import type { TripSession } from "./trip-session.js";
import { updateItineraryTool } from "./update-itinerary-tool.js";
import { readWorkerBriefFactsTool } from "./worker-brief-facts-tool.js";

// Part of every tool name the model sees, such as mcp__trip__read_trip_brief (tool
// design, section 1).
export const TRIP_SERVER_NAME = "trip";

// Made for each session, with its trip already set. One server object can't be shared
// by two sessions running at once (tool design, section 4).
export function createTripServer(
  session: TripSession,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: TRIP_SERVER_NAME,
    // The coordinator uses these tools in most turns, so they're never left for it to
    // find with a tool search.
    alwaysLoad: true,
    tools: [
      readTripBriefTool(session),
      updateTripBriefTool(session),
      readItineraryTool(session),
      findInTripTool(session),
      updateItineraryTool(session),
      addStayTool(session),
      updateStayTool(session),
      removeStayTool(session),
      updateDayTool(session),
      addStopsTool(session),
      updateStopTool(session),
      moveStopTool(session),
      removeStopsTool(session),
      setWaypointsTool(session),
      selectCandidateTool(session),
      selectUserPlaceTool(session),
      rejectPlacesTool(session),
      // The workers' tools. Each agent's definition lists the ones it's sent, so the
      // coordinator doesn't see these (tool design, section 3).
      readWorkerBriefFactsTool(session),
      addLodgingCandidatesTool(session),
      addStopCandidatesTool(session),
      setStayWeatherTool(session),
    ],
  });
}
